import {
  ConflictException,
  Injectable,
  Logger,
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
import { OrderDetails, OrderItems } from '../order/entities/order.entity';
import { Catalog } from '../catlog/entities/catalog.entity';
import {
  ENABLED_STATUSES,
  MeasurementType,
  ShareCatalogStatus,
} from 'src/common/enums';
import { MONEY_STATUSES } from '../reports/reports.filters';
import { toBase } from 'src/common/utils/units';
import {
  ScheduleWindow,
  windowsOverlap,
  computeCurrentWindowStart,
} from './share-catlaog.window';
import { reconcileStock } from './stock-reconcile';

/**
 * One row per product on a share catalog: its stock allocation and what it has
 * sold in this catalog's windows. Amounts are in the product's base unit
 * (g / ml / count); prices are the per-variant sale prices collapsed to a range.
 */
export interface ShareCatalogProductSummary {
  productId: string;
  name: string;
  image: string[];
  measurementType: MeasurementType;
  isDeleted: boolean;
  /** How many variant (weight SKU) rows this product contributes. */
  variantCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  offered: number;
  remaining: number;
  soldQuantity: number;
  soldAmount: number;
  orders: number;
}

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
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  private readonly logger = new Logger(ShareCatlaogService.name);

  private readonly detailRelations = {
    ShareCatalogProducts: { product: true, variant: true },
    ShareCatalogProductStock: { product: true },
    catalog: true,
  } as const;

  /**
   * The create wizard's dropdown already hides deleted catalogs, but the API
   * does not — without this a share catalog could be attached to one directly.
   */
  private async assertCatalogSelectable(catalogId: string) {
    const catalog = await this.catalogRepository.findOne({
      where: { id: catalogId, isDeleted: false },
      select: ['id'],
    });
    if (!catalog) {
      throw new NotFoundException(`Catalog ${catalogId} not found`);
    }
  }

  async create(createShareCatlaogDto: CreateShareCatlaogDto) {
    await this.assertCatalogSelectable(createShareCatlaogDto.catalogId);

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
   * The first enabled (ACTIVE / LIVE) catalog whose schedule overlaps `window`,
   * or null when the slot is free. `excludeId` skips the catalog itself when
   * re-validating on activate/update/resume.
   */
  private async findOverlapping(
    window: ScheduleWindow,
    excludeId?: string,
  ): Promise<ShareCatalog | null> {
    const others = await this.shareCatalogRepository.find({
      where: { status: In(ENABLED_STATUSES), isDeleted: false },
      relations: { catalog: true },
    });
    for (const other of others) {
      if (other.id === excludeId) continue;
      if (windowsOverlap(window, other)) return other;
    }
    return null;
  }

  /** Same as findOverlapping, but raises the 409 the admin UI surfaces. */
  private async assertNoOverlap(window: ScheduleWindow, excludeId?: string) {
    const other = await this.findOverlapping(window, excludeId);
    if (other) {
      throw new ConflictException(
        `Schedule overlaps "${other.catalog?.name ?? other.id}" ` +
          `(${other.daysOfWeek.join(',')} ${other.startTime}-${other.endTime})`,
      );
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

  /**
   * Resumes a PAUSED catalog once a top-up makes it sellable again. In-window it
   * goes LIVE (variants reactivated, no re-broadcast to avoid spamming customers
   * mid-window); out-of-window it goes ACTIVE for the cron to promote at the next
   * window open. No-op for any non-PAUSED catalog or one still with no sellable
   * product.
   *
   * A PAUSED catalog does not reserve its slot, so another catalog may have
   * taken the window in the meantime. In that case the catalog stays PAUSED
   * (the top-up is still applied) until the admin reschedules it or switches
   * the conflicting catalog off — resuming would put two catalogs live at once.
   */
  private async resumeIfSellable(id: string) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id },
      relations: {
        ShareCatalogProducts: { variant: true },
        ShareCatalogProductStock: true,
      },
    });
    if (!catalog || catalog.status !== ShareCatalogStatus.PAUSED) return;
    if (!this.hasAnySellable(catalog)) return;

    const conflict = await this.findOverlapping(
      {
        daysOfWeek: catalog.daysOfWeek,
        startTime: catalog.startTime,
        endTime: catalog.endTime,
      },
      catalog.id,
    );
    if (conflict) {
      this.logger.warn(
        `Share catalog ${catalog.id} stays PAUSED: its schedule now overlaps ` +
          `"${conflict.catalog?.name ?? conflict.id}" ` +
          `(${conflict.daysOfWeek.join(',')} ${conflict.startTime}-${conflict.endTime})`,
      );
      return;
    }

    const windowStart = computeCurrentWindowStart(
      new Date(),
      catalog.daysOfWeek,
      catalog.startTime,
      catalog.endTime,
    );

    if (windowStart !== null) {
      const variantIds = (catalog.ShareCatalogProducts ?? [])
        .filter((scp: any) => scp.variantId)
        .map((scp: any) => scp.variantId);
      if (variantIds.length) {
        await this.variantRepository
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ isActive: true })
          .whereInIds(variantIds)
          .execute();
      }
      catalog.status = ShareCatalogStatus.LIVE;
      catalog.lastWindowOpenedAt = windowStart;
    } else {
      catalog.status = ShareCatalogStatus.ACTIVE;
      catalog.lastWindowOpenedAt = new Date();
    }
    await this.shareCatalogRepository.save(catalog);
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
      where: { isDeleted: false },
      relations: this.detailRelations,
    });
  }

  findOne(id: string) {
    return this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
      relations: this.detailRelations,
    });
  }

  /**
   * Detail view for the admin: the catalog plus a per-PRODUCT roll-up
   * (`productSummary`). The variant rows are still returned untouched for the
   * edit screen; the view screen reads the roll-up instead so an admin sees one
   * line per product with what is left and what it sold, rather than one line
   * per weight SKU.
   */
  async findOneWithSummary(id: string) {
    const catalog = await this.findOne(id);
    if (!catalog) return null;
    return {
      ...catalog,
      productSummary: await this.buildProductSummary(catalog),
    };
  }

  /**
   * Per-product roll-up for one share catalog.
   *
   * Stock comes from ShareCatalogProductStock (`offered` / `remaining`, in the
   * product's base unit). Sales are attributed through
   * OrderDetails.stockCatalogId — the same attribution the catalog-performance
   * report uses — and restricted to booked-revenue statuses, so cancelled and
   * never-confirmed carts do not count as sales.
   *
   * `soldQuantity` is derived from the order items (variant amount x quantity),
   * not from `offered - remaining`, because offered is topped up additively on
   * edit and would otherwise conflate a restock with a sale.
   */
  private async buildProductSummary(
    catalog: ShareCatalog,
  ): Promise<ShareCatalogProductSummary[]> {
    const salesByProduct = await this.getSalesByProduct(catalog.id);

    const stockByProduct = new Map<string, ShareCatalogProductStock>();
    for (const s of catalog.ShareCatalogProductStock ?? []) {
      stockByProduct.set(s.productId, s);
    }

    // One entry per product, in the order the products appear on the catalog.
    const summaries = new Map<string, ShareCatalogProductSummary>();
    for (const scp of catalog.ShareCatalogProducts ?? []) {
      let row = summaries.get(scp.productId);
      if (!row) {
        const stock = stockByProduct.get(scp.productId);
        const sales = salesByProduct.get(scp.productId);
        row = {
          productId: scp.productId,
          name: scp.product?.name ?? 'Unknown product',
          image: scp.product?.image ?? [],
          measurementType:
            scp.product?.measurementType ?? MeasurementType.WEIGHT,
          isDeleted: scp.product?.isDeleted ?? false,
          variantCount: 0,
          minPrice: null,
          maxPrice: null,
          offered: stock?.offeredGrams ?? 0,
          remaining: stock?.remainingGrams ?? 0,
          soldQuantity: sales?.soldQuantity ?? 0,
          soldAmount: sales?.soldAmount ?? 0,
          orders: sales?.orders ?? 0,
        };
        summaries.set(scp.productId, row);
      }

      row.variantCount += 1;
      const price = Number(scp.price) || 0;
      row.minPrice = row.minPrice === null ? price : Math.min(row.minPrice, price);
      row.maxPrice = row.maxPrice === null ? price : Math.max(row.maxPrice, price);
    }

    return [...summaries.values()];
  }

  /** Sold amount / quantity / order count per product for one catalog. */
  private async getSalesByProduct(shareCatalogId: string) {
    const rows = await this.orderItemsRepository
      .createQueryBuilder('oi')
      .innerJoin(OrderDetails, 'o', 'o.id = oi.orderId')
      .leftJoin(ProductVariant, 'v', 'v.id = oi.variantId')
      .select('oi.productId', 'productId')
      .addSelect('COALESCE(SUM(COALESCE(v.weight, 0) * oi.quantity), 0)', 'soldQuantity')
      .addSelect('COALESCE(SUM(oi.totalPrice), 0)', 'soldAmount')
      .addSelect('COUNT(DISTINCT oi.orderId)', 'orders')
      .where('o.stockCatalogId = :shareCatalogId', { shareCatalogId })
      .andWhere('o.status IN (:...statuses)', { statuses: MONEY_STATUSES })
      .groupBy('oi.productId')
      .getRawMany<{
        productId: string;
        soldQuantity: string;
        soldAmount: string;
        orders: string;
      }>();

    return new Map(
      rows.map((r) => [
        r.productId,
        {
          soldQuantity: Number(r.soldQuantity ?? 0),
          soldAmount: Number(r.soldAmount ?? 0),
          orders: Number(r.orders ?? 0),
        },
      ]),
    );
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    // The count must carry the same filter as the find, or the page total
    // over-reports and the last page renders short.
    const [total, data] = await Promise.all([
      this.shareCatalogRepository.count({ where: { isDeleted: false } }),
      this.shareCatalogRepository.find({
        where: { isDeleted: false },
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
   * and per-product offered quantities. If a top-up makes a PAUSED catalog
   * sellable again, it is auto-resumed (see resumeIfSellable).
   */
  async update(id: string, dto: UpdateShareCatlaogDto) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (dto.catalogId !== undefined) {
      await this.assertCatalogSelectable(dto.catalogId);
    }

    const scheduleChanged =
      dto.daysOfWeek !== undefined ||
      dto.startTime !== undefined ||
      dto.endTime !== undefined;

    if (dto.catalogId !== undefined) catalog.catalogId = dto.catalogId;
    if (dto.daysOfWeek !== undefined) catalog.daysOfWeek = dto.daysOfWeek;
    if (dto.startTime !== undefined) catalog.startTime = dto.startTime;
    if (dto.endTime !== undefined) catalog.endTime = dto.endTime;

    // Re-validate the resulting window for every status: a schedule is rejected
    // on save if it collides with an enabled (ACTIVE/LIVE) catalog, even while
    // this one is switched off. Two switched-off catalogs may still share a
    // window, since only enabled catalogs reserve a slot.
    if (scheduleChanged) {
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
    let toppedUp = false;
    if (dto.productQuantities !== undefined) {
      const includedProductIds =
        dto.shareCatalogProducts !== undefined
          ? dto.shareCatalogProducts.map((p) => p.productId)
          : undefined;
      const deltas = this.toStockDeltas(dto.productQuantities);
      toppedUp = deltas.some((d) => d.addBase > 0);
      await this.applyStockDeltas(id, deltas, includedProductIds);
    }

    // Only a genuine stock increase can bring a PAUSED (sold-out) catalog back;
    // schedule/price-only edits must not silently un-pause it.
    if (toppedUp) {
      await this.resumeIfSellable(id);
    }

    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: this.detailRelations,
    });
  }

  /**
   * Hides a share catalog from every list and detail view, keeping its product
   * rows, stock allocations and the orders placed against it intact.
   *
   * A LIVE catalog is closed first so its variants stop showing to customers,
   * mirroring `setActive(false)` and `remove()`. Status drops to INACTIVE so a
   * deleted row never reads as LIVE; the schedule slot is released either way,
   * since `findOverlapping` already skips deleted catalogs.
   */
  async softDelete(id: string) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (catalog.status === ShareCatalogStatus.LIVE) {
      await this.closeCatalog(catalog);
    }

    await this.shareCatalogRepository.update(id, {
      status: ShareCatalogStatus.INACTIVE,
      isDeleted: true,
    });

    return { success: true };
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
