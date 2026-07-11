import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { toBase } from 'src/common/utils/units';
import { ScheduleWindow, windowsOverlap } from './share-catlaog.window';
import { reconcileStock } from './stock-reconcile';

/** Statuses the cron/customer flow treats as "enabled". */
export const ENABLED_STATUSES = [
  ShareCatalogStatus.ACTIVE,
  ShareCatalogStatus.LIVE,
];

/** Statuses that occupy a time slot and thus block an overlapping schedule. */
export const SLOT_OCCUPYING_STATUSES = [
  ShareCatalogStatus.ACTIVE,
  ShareCatalogStatus.LIVE,
  ShareCatalogStatus.PAUSED,
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
    // Multiple catalogs may be enabled at once as long as their schedule
    // windows don't overlap.
    await this.assertNoOverlap({
      daysOfWeek: createShareCatlaogDto.daysOfWeek,
      startTime: createShareCatlaogDto.startTime,
      endTime: createShareCatlaogDto.endTime,
    });

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

    await this.saveVariantPriceRows(
      shareCatalog.id,
      createShareCatlaogDto.shareCatalogProducts,
    );
    await this.applyStockDeltas(
      shareCatalog.id,
      this.toStockDeltas(createShareCatlaogDto.productQuantities),
      createShareCatlaogDto.shareCatalogProducts.map((p) => p.productId),
    );

    return this.shareCatalogRepository.findOne({
      where: { id: shareCatalog.id },
      relations: this.detailRelations,
    });
  }

  /** Rebuilds the per-variant price rows for a share catalog. */
  private async saveVariantPriceRows(
    shareCatalogId: string,
    products: { productId: string; variantId: string; price: number }[],
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
  }

  /**
   * Additively applies per-product stock deltas (see reconcileStock). Existing
   * rows gain the delta (sold preserved), new products are inserted, and — when
   * `includedProductIds` is provided — products dropped from the share have their
   * stock row removed. Passing `includedProductIds === undefined` deletes nothing.
   */
  private async applyStockDeltas(
    shareCatalogId: string,
    deltas: { productId: string; addBase: number }[],
    includedProductIds?: string[],
  ) {
    const existingRows = await this.shareCatalogProductStockRepository.find({
      where: { shareCatalogId },
    });

    const result = reconcileStock(
      existingRows.map((r) => ({
        productId: r.productId,
        offeredGrams: r.offeredGrams,
        remainingGrams: r.remainingGrams,
      })),
      deltas,
      includedProductIds,
    );

    const byProduct = new Map(existingRows.map((r) => [r.productId, r]));
    for (const u of result.upserts) {
      const row = byProduct.get(u.productId);
      if (row) {
        row.offeredGrams = u.offeredGrams;
        row.remainingGrams = u.remainingGrams;
        await this.shareCatalogProductStockRepository.save(row);
      } else {
        await this.shareCatalogProductStockRepository.save(
          this.shareCatalogProductStockRepository.create({
            shareCatalogId,
            productId: u.productId,
            offeredGrams: u.offeredGrams,
            remainingGrams: u.remainingGrams,
          }),
        );
      }
    }

    if (result.deletes.length) {
      await this.shareCatalogProductStockRepository.delete({
        shareCatalogId,
        productId: In(result.deletes),
      });
    }
  }

  /** Maps DTO productQuantities to base-unit deltas. */
  private toStockDeltas(
    quantities: { productId: string; addQnty: number; qntyUnit: any }[] = [],
  ): { productId: string; addBase: number }[] {
    return quantities.map((q) => ({
      productId: q.productId,
      addBase: toBase(q.addQnty, q.qntyUnit),
    }));
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
      await this.assertNoOverlap(
        {
          daysOfWeek: catalog.daysOfWeek,
          startTime: catalog.startTime,
          endTime: catalog.endTime,
        },
        id,
      );

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

  /**
   * Throws if `window` overlaps the schedule of any other slot-occupying
   * catalog (ACTIVE / LIVE / PAUSED). `excludeId` skips the catalog itself when
   * re-validating on activate/update.
   */
  private async assertNoOverlap(window: ScheduleWindow, excludeId?: string) {
    const others = await this.shareCatalogRepository.find({
      where: { status: In(SLOT_OCCUPYING_STATUSES), isDeleted: false },
      relations: { catalog: true },
    });
    for (const other of others) {
      if (other.id === excludeId) continue;
      if (windowsOverlap(window, other)) {
        throw new ConflictException(
          `Schedule overlaps "${other.catalog?.name ?? other.id}" ` +
            `(${other.daysOfWeek.join(',')} ${other.startTime}-${other.endTime})`,
        );
      }
    }
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

    const scheduleChanged =
      dto.daysOfWeek !== undefined ||
      dto.startTime !== undefined ||
      dto.endTime !== undefined;

    if (dto.catalogId !== undefined) catalog.catalogId = dto.catalogId;
    if (dto.daysOfWeek !== undefined) catalog.daysOfWeek = dto.daysOfWeek;
    if (dto.startTime !== undefined) catalog.startTime = dto.startTime;
    if (dto.endTime !== undefined) catalog.endTime = dto.endTime;

    // Re-validate the resulting window only while the catalog occupies a slot;
    // an INACTIVE catalog's schedule is checked when it is next activated.
    if (scheduleChanged && SLOT_OCCUPYING_STATUSES.includes(catalog.status)) {
      await this.assertNoOverlap(
        {
          daysOfWeek: catalog.daysOfWeek,
          startTime: catalog.startTime,
          endTime: catalog.endTime,
        },
        id,
      );
    }

    await this.shareCatalogRepository.save(catalog);

    // Variant/price rows are still rebuilt when supplied.
    if (dto.shareCatalogProducts !== undefined) {
      await this.shareCatalogProductsRepository.delete({ shareCatalogId: id });
      await this.saveVariantPriceRows(id, dto.shareCatalogProducts);
    }

    // Stock is applied additively — never reset (preserves sold + remaining).
    if (dto.productQuantities !== undefined) {
      const includedProductIds =
        dto.shareCatalogProducts !== undefined
          ? dto.shareCatalogProducts.map((p) => p.productId)
          : undefined;
      await this.applyStockDeltas(
        id,
        this.toStockDeltas(dto.productQuantities),
        includedProductIds,
      );
    }

    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: this.detailRelations,
    });
  }

  /**
   * Permanently deletes a share catalog and its child rows. If the catalog is LIVE
   * its variants are deactivated first (mirrors `setActive(false)` -> `closeCatalog`)
   * so products stop showing to customers. No DB cascades exist, so children are
   * cleaned manually, and the `_CatalogToShareCatalogProducts` join is detached first.
   */
  async remove(id: string) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id },
      relations: { ShareCatalogProducts: true },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (catalog.status === ShareCatalogStatus.LIVE) {
      await this.closeCatalog(catalog);
    }

    // Detach ManyToMany join (_CatalogToShareCatalogProducts, column B = ShareCatalogProducts.id)
    // to avoid FK errors when deleting the ShareCatalogProducts rows below.
    const scpIds = (catalog.ShareCatalogProducts ?? []).map((scp) => scp.id);
    if (scpIds.length) {
      await this.shareCatalogProductsRepository.query(
        'DELETE FROM "_CatalogToShareCatalogProducts" WHERE "B" = ANY($1)',
        [scpIds],
      );
    }

    await this.shareCatalogProductsRepository.delete({ shareCatalogId: id });
    await this.shareCatalogProductStockRepository.delete({ shareCatalogId: id });
    await this.shareCatalogRepository.delete(id);

    return { success: true };
  }
}
