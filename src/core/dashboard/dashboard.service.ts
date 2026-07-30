import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderDetails, OrderItems } from '../order/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { Category } from '../category/entities/category.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../share-catlaog/entities/share-catalog-product-stock.entity';
import {
  MeasurementType,
  OrderStatus,
  ShareCatalogStatus,
  UserTypes,
} from 'src/common/enums';
import { RangeKey, resolveRange } from 'src/common/utils/date-range';

/** Label used for products that have no category row. */
const UNCATEGORISED = 'Uncategorised';

/** How many products the top-selling query returns. */
const TOP_SELLING_LIMIT = 20;

export interface FamilyTotals {
  offered: number;
  sold: number;
  remaining: number;
}

export interface StockStatus {
  isLive: boolean;
  catalogName: string | null;
  windowLabel: string;
  soldPercent: number;
  /** Per measurement family, in that family's base unit. Never summed across. */
  byFamily: Partial<Record<MeasurementType, FamilyTotals>>;
}

export interface TopSellingProduct {
  productId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  measurementType: MeasurementType;
  /** Quantity sold in the product's base unit (g / ml / count). */
  soldBase: number;
  /** Amount the current/last catalog offered, or null if not in it. */
  offeredBase: number | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(OrderDetails)
    private readonly orderRepository: Repository<OrderDetails>,
    @InjectRepository(OrderItems)
    private readonly orderItemsRepository: Repository<OrderItems>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ShareCatalogProductStock)
    private readonly stockRepository: Repository<ShareCatalogProductStock>,
  ) {}

  /**
   * Headline stat cards.
   *
   * Revenue and order volume are period-scoped and count DELIVERED orders only
   * — strictly realised revenue, excluding abandoned WhatsApp carts (DRAFT),
   * unconfirmed (PENDING) and CANCELLED orders.
   *
   * `customers` and `pendingOrders` are deliberately *all-time* snapshots, not
   * period-scoped: a pending count that read 0 for "Today" while orders sat
   * unhandled from yesterday would hide the backlog it exists to surface. The
   * UI labels both cards "all time" so the period selector's scope is clear.
   */
  async getSummary(range: RangeKey) {
    const { from, to } = resolveRange(range);

    const [delivered, customers, pendingOrders] = await Promise.all([
      this.orderRepository
        .createQueryBuilder('o')
        // COALESCE because SUM over zero rows is NULL, which would reach the
        // UI as "₹NaN" on a day with no deliveries yet.
        .select('COALESCE(SUM(o.totalAmount), 0)', 'revenue')
        .addSelect('COUNT(o.id)', 'orders')
        .where('o.status = :status', { status: OrderStatus.DELIVERED })
        .andWhere('o.createdAt >= :from AND o.createdAt < :to', { from, to })
        .getRawOne<{ revenue: string; orders: string }>(),
      this.userRepository.count({ where: { userType: UserTypes.CUSTOMER } }),
      this.orderRepository.count({ where: { status: OrderStatus.PENDING } }),
    ]);

    return {
      range: { key: range, from, to },
      revenue: Number(delivered?.revenue ?? 0),
      orders: Number(delivered?.orders ?? 0),
      customers,
      pendingOrders,
    };
  }

  /**
   * The share catalog the stock figures should be read from: the LIVE one, or
   * failing that the most recently opened one. ShareCatalogProductStock is not
   * reset when a window opens, so the last window's remaining amounts are
   * still the true current allocation between windows.
   */
  private async resolveStockCatalog(): Promise<{
    catalog: ShareCatalog | null;
    isLive: boolean;
  }> {
    const live = await this.shareCatalogRepository.findOne({
      where: { status: ShareCatalogStatus.LIVE, isDeleted: false },
      relations: { catalog: true },
    });
    if (live) return { catalog: live, isLive: true };

    const last = await this.shareCatalogRepository
      .createQueryBuilder('sc')
      .leftJoinAndSelect('sc.catalog', 'catalog')
      .where('sc.isDeleted = false')
      .orderBy('sc.lastWindowOpenedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('sc.createdAt', 'DESC')
      .getOne();

    return { catalog: last ?? null, isLive: false };
  }

  /**
   * Sell-through of the live (or last) catalog window.
   *
   * `offeredGrams` / `remainingGrams` hold grams for WEIGHT products,
   * millilitres for VOLUME and a raw count for COUNT — adding them together
   * would be dimensional nonsense, so totals are bucketed per measurement
   * family. `soldPercent` is a dimensionless rate, so aggregating it across
   * families is safe.
   *
   * Returns null when there is no catalog at all; the card renders empty.
   */
  async getStockStatus(): Promise<StockStatus | null> {
    const { catalog, isLive } = await this.resolveStockCatalog();
    if (!catalog) return null;

    const rows = await this.stockRepository.find({
      where: { shareCatalogId: catalog.id },
      relations: { product: true },
    });

    const byFamily: Partial<Record<MeasurementType, FamilyTotals>> = {};
    let totalOffered = 0;
    let totalSold = 0;

    for (const row of rows) {
      const family: MeasurementType =
        row.product?.measurementType ?? MeasurementType.WEIGHT;
      const offered = row.offeredGrams ?? 0;
      const remaining = row.remainingGrams ?? 0;
      const sold = Math.max(0, offered - remaining);

      const bucket =
        byFamily[family] ?? (byFamily[family] = { offered: 0, sold: 0, remaining: 0 });
      bucket.offered += offered;
      bucket.sold += sold;
      bucket.remaining += remaining;

      totalOffered += offered;
      totalSold += sold;
    }

    // Drop families that were loaded but offered nothing — an empty row would
    // render a meaningless "0 count" in the footer.
    for (const key of Object.keys(byFamily) as MeasurementType[]) {
      if (byFamily[key]!.offered <= 0) delete byFamily[key];
    }

    return {
      isLive,
      catalogName: catalog.catalog?.name ?? null,
      windowLabel: `${catalog.startTime}–${catalog.endTime}`,
      soldPercent:
        totalOffered > 0 ? Math.round((totalSold / totalOffered) * 100) : 0,
      byFamily,
    };
  }

  /**
   * Products ranked by quantity sold in the period, with the amount the
   * current/last catalog offered as the denominator for the UI's sold/total
   * badge.
   *
   * Quantity is `OrderItems.quantity × ProductVariants.weight`; `weight` is
   * already stored in the product's base unit, the same convention
   * OrderService.applyStockDeduction uses. The variant join is an INNER join:
   * an item with a null variantId would otherwise contribute NULL and poison
   * the SUM for that product.
   *
   * Returns 20 products so the UI's category chips can each show a top-5 list
   * without re-fetching.
   */
  async getTopSelling(range: RangeKey) {
    const { from, to } = resolveRange(range);

    const raw = await this.orderItemsRepository
      .createQueryBuilder('item')
      .innerJoin(OrderDetails, 'o', 'o.id = item.orderId')
      .innerJoin(ProductVariant, 'v', 'v.id = item.variantId')
      .innerJoin(Products, 'p', 'p.id = item.productId')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      .select('p.id', 'productId')
      .addSelect('p.name', 'name')
      .addSelect('p.measurementType', 'measurementType')
      .addSelect('c.id', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('SUM(item.quantity * v.weight)', 'soldBase')
      .where('o.status = :status', { status: OrderStatus.DELIVERED })
      .andWhere('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('p.measurementType')
      .addGroupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('SUM(item.quantity * v.weight)', 'DESC')
      .limit(TOP_SELLING_LIMIT)
      .getRawMany<{
        productId: string;
        name: string;
        measurementType: MeasurementType;
        categoryId: string | null;
        categoryName: string | null;
        soldBase: string;
      }>();

    // Offered amounts come from whichever catalog the stock chart is showing,
    // so the two widgets never disagree.
    const { catalog } = await this.resolveStockCatalog();
    const offeredByProduct = new Map<string, number>();
    if (catalog) {
      const stock = await this.stockRepository.find({
        where: { shareCatalogId: catalog.id },
      });
      for (const s of stock) offeredByProduct.set(s.productId, s.offeredGrams ?? 0);
    }

    const products: TopSellingProduct[] = raw.map((r) => ({
      productId: r.productId,
      name: r.name,
      categoryId: r.categoryId ?? null,
      categoryName: r.categoryName ?? UNCATEGORISED,
      measurementType: r.measurementType ?? MeasurementType.WEIGHT,
      soldBase: Number(r.soldBase ?? 0),
      offeredBase: offeredByProduct.has(r.productId)
        ? offeredByProduct.get(r.productId)!
        : null,
    }));

    // Chips are derived from the products actually sold, so a chip can never
    // filter the list down to nothing. The "All" chip is synthesised client-side.
    const counts = new Map<
      string,
      { id: string | null; name: string; productCount: number }
    >();
    for (const p of products) {
      const key = p.categoryId ?? UNCATEGORISED;
      let entry = counts.get(key);
      if (!entry) {
        entry = { id: p.categoryId, name: p.categoryName, productCount: 0 };
        counts.set(key, entry);
      }
      entry.productCount += 1;
    }

    return {
      range: { key: range, from, to },
      categories: [...counts.values()].sort(
        (a, b) => b.productCount - a.productCount,
      ),
      products,
    };
  }
}
