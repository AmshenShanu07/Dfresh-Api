import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { ShareCatalogProductStock } from './entities/share-catalog-product-stock.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { ShareCatalogStatus } from 'src/common/enums';
import { toGrams } from 'src/common/utils/units';

/** Statuses the cron/customer flow treats as "enabled". */
export const ENABLED_STATUSES = [
  ShareCatalogStatus.ACTIVE,
  ShareCatalogStatus.LIVE,
];

@Injectable()
export class ShareCatlaogService {
  constructor(
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ShareCatalogProducts)
    private readonly shareCatalogProductsRepository: Repository<ShareCatalogProducts>,
    @InjectRepository(ShareCatalogProductStock)
    private readonly shareCatalogProductStockRepository: Repository<ShareCatalogProductStock>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
  ) {}

  private readonly detailRelations = {
    ShareCatalogProducts: { product: true, variant: true },
    ShareCatalogProductStock: { product: true },
    catalog: true,
  } as const;

  async create(createShareCatlaogDto: CreateShareCatlaogDto) {
    // Demote any currently-enabled catalog — only one is enabled at a time.
    const previous = await this.shareCatalogRepository.find({
      where: { status: In(ENABLED_STATUSES), isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });
    for (const cat of previous) {
      if (cat.status === ShareCatalogStatus.LIVE) {
        await this.closeCatalog(cat);
      }
      cat.status = ShareCatalogStatus.INACTIVE;
      await this.shareCatalogRepository.save(cat);
    }

    const shareCatalog = await this.shareCatalogRepository.save(
      this.shareCatalogRepository.create({
        catalogId: createShareCatlaogDto.catalogId,
        daysOfWeek: createShareCatlaogDto.daysOfWeek,
        startTime: createShareCatlaogDto.startTime,
        endTime: createShareCatlaogDto.endTime,
        status: ShareCatalogStatus.ACTIVE,
        // Gate against firing for an already-open window at creation time;
        // cron requires the next windowStart to exceed this timestamp.
        lastWindowOpenedAt: new Date(),
      }),
    );

    await this.saveProductsAndStock(
      shareCatalog.id,
      createShareCatlaogDto.shareCatalogProducts,
      createShareCatlaogDto.productQuantities,
    );

    return this.shareCatalogRepository.findOne({
      where: { id: shareCatalog.id },
      relations: this.detailRelations,
    });
  }

  /** Persists per-variant price rows and per-product stock allocations. */
  private async saveProductsAndStock(
    shareCatalogId: string,
    products: { productId: string; variantId: string; price: number }[],
    quantities: { productId: string; qnty: number; qntyUnit: any }[],
  ) {
    await this.shareCatalogProductsRepository.save(
      products.map((product) =>
        this.shareCatalogProductsRepository.create({
          shareCatalogId,
          productId: product.productId,
          variantId: product.variantId,
          price: product.price,
        }),
      ),
    );

    await this.shareCatalogProductStockRepository.save(
      (quantities ?? []).map((q) => {
        const grams = toGrams(q.qnty, q.qntyUnit);
        return this.shareCatalogProductStockRepository.create({
          shareCatalogId,
          productId: q.productId,
          offeredGrams: grams,
          remainingGrams: grams,
        });
      }),
    );
  }

  async setActive(id: string, active: boolean) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (active) {
      const others = await this.shareCatalogRepository.find({
        where: { status: In(ENABLED_STATUSES), isDeleted: false },
        relations: { ShareCatalogProducts: true },
      });
      for (const other of others) {
        if (other.id === id) continue;
        if (other.status === ShareCatalogStatus.LIVE) {
          await this.closeCatalog(other);
        }
        other.status = ShareCatalogStatus.INACTIVE;
        await this.shareCatalogRepository.save(other);
      }

      catalog.status = ShareCatalogStatus.ACTIVE;
      catalog.lastWindowOpenedAt = new Date();
    } else {
      if (catalog.status === ShareCatalogStatus.LIVE) {
        await this.closeCatalog(catalog);
      }
      catalog.status = ShareCatalogStatus.INACTIVE;
    }

    await this.shareCatalogRepository.save(catalog);
    return catalog;
  }

  /** Deactivates a catalog's variants when its window closes. */
  async closeCatalog(catalog: ShareCatalog) {
    const products = catalog.ShareCatalogProducts ?? [];
    const variantIds = products
      .filter((scp: any) => scp.variantId)
      .map((scp: any) => scp.variantId);
    if (variantIds.length) {
      await this.variantRepository
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ isActive: false })
        .whereInIds(variantIds)
        .execute();
    }
  }

  /**
   * Recomputes status after stock changes. If no product in the catalog has a
   * sellable variant (a variant whose weight fits the remaining allocation),
   * the catalog is auto-PAUSED and its variants are deactivated. Requires a
   * manual resume afterwards.
   */
  async recomputeStatusAfterDeduction(catalogId: string) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id: catalogId },
      relations: {
        ShareCatalogProducts: { variant: true },
        ShareCatalogProductStock: true,
      },
    });
    if (!catalog) return;
    if (
      catalog.status !== ShareCatalogStatus.LIVE &&
      catalog.status !== ShareCatalogStatus.ACTIVE
    ) {
      return;
    }

    if (!this.hasAnySellable(catalog)) {
      await this.closeCatalog(catalog);
      catalog.status = ShareCatalogStatus.PAUSED;
      await this.shareCatalogRepository.save(catalog);
    }
  }

  /** True if any product has a variant that fits its remaining allocation. */
  hasAnySellable(catalog: ShareCatalog): boolean {
    const stockByProduct = new Map<string, number>();
    for (const s of catalog.ShareCatalogProductStock ?? []) {
      stockByProduct.set(s.productId, s.remainingGrams);
    }
    for (const scp of catalog.ShareCatalogProducts ?? []) {
      const remaining = stockByProduct.get(scp.productId) ?? 0;
      const weight = scp.variant?.weight ?? Infinity;
      if (remaining > 0 && weight <= remaining) return true;
    }
    return false;
  }

  findAll() {
    return this.shareCatalogRepository.find({
      relations: this.detailRelations,
    });
  }

  findOne(id: string) {
    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: this.detailRelations,
    });
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.shareCatalogRepository.count(),
      this.shareCatalogRepository.find({
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        relations: {
          ShareCatalogProducts: { product: { category: true }, variant: true },
          ShareCatalogProductStock: { product: true },
          catalog: true,
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  /**
   * Edits a share catalog: schedule, the set of products (variant price rows)
   * and per-product offered quantities. Does NOT auto-resume a PAUSED catalog —
   * use setActive(true) after topping up.
   */
  async update(id: string, dto: UpdateShareCatlaogDto) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (dto.catalogId !== undefined) catalog.catalogId = dto.catalogId;
    if (dto.daysOfWeek !== undefined) catalog.daysOfWeek = dto.daysOfWeek;
    if (dto.startTime !== undefined) catalog.startTime = dto.startTime;
    if (dto.endTime !== undefined) catalog.endTime = dto.endTime;
    await this.shareCatalogRepository.save(catalog);

    // Rebuild product/price + stock rows when the caller supplies them.
    if (dto.shareCatalogProducts !== undefined) {
      await this.shareCatalogProductsRepository.delete({ shareCatalogId: id });
      await this.shareCatalogProductStockRepository.delete({ shareCatalogId: id });
      await this.saveProductsAndStock(
        id,
        dto.shareCatalogProducts,
        dto.productQuantities ?? [],
      );
    } else if (dto.productQuantities !== undefined) {
      // Quantity-only edit (top-up): replace stock allocations.
      await this.shareCatalogProductStockRepository.delete({ shareCatalogId: id });
      await this.shareCatalogProductStockRepository.save(
        dto.productQuantities.map((q) => {
          const grams = toGrams(q.qnty, q.qntyUnit);
          return this.shareCatalogProductStockRepository.create({
            shareCatalogId: id,
            productId: q.productId,
            offeredGrams: grams,
            remainingGrams: grams,
          });
        }),
      );
    }

    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: this.detailRelations,
    });
  }

  async remove(id: string) {
    await this.shareCatalogRepository.update(id, { isDeleted: true });
    return { success: true };
  }
}
