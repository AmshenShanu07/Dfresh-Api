import { MeasurementType, ShareCatalogStatus } from 'src/common/enums';
import { formatAmount } from 'src/common/utils/units';
import { ShareCatalog } from '../../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../../share-catlaog/entities/share-catalog-product-stock.entity';
import { Products } from '../../product/entities/product.entity';
import { Category } from '../../category/entities/category.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS } from '../reports.filters';

export interface StockCatalogRow {
  productId: string;
  product: string;
  category: string;
  measurementType: MeasurementType;
  offeredBase: number;
  soldBase: number;
  remainingBase: number;
  sellThrough: number;
  exhausted: boolean;
}

/**
 * Resolves which catalog the stock figures describe: the LIVE one, or failing
 * that the most recently opened. Mirrors DashboardService.resolveStockCatalog
 * so the report and the dashboard gauge never point at different catalogs.
 *
 * ShareCatalogProductStock is not reset when a window opens, so between windows
 * the last window's remaining amounts are still the true current allocation.
 */
async function resolveStockCatalog(db: any) {
  const live = await db.getRepository(ShareCatalog).findOne({
    where: { status: ShareCatalogStatus.LIVE, isDeleted: false },
    relations: { catalog: true },
  });
  if (live) return live;

  return db
    .getRepository(ShareCatalog)
    .createQueryBuilder('sc')
    .leftJoinAndSelect('sc.catalog', 'catalog')
    .where('sc.isDeleted = false')
    .orderBy('sc.lastWindowOpenedAt', 'DESC', 'NULLS LAST')
    .addOrderBy('sc.createdAt', 'DESC')
    .getOne();
}

export const stockCatalogReport = defineReport<StockCatalogRow>({
  slug: 'stock-catalog',
  title: 'Catalog Stock',
  description:
    'Offered vs sold vs remaining for the live (or most recent) catalog window. A snapshot, not a period.',
  filters: ['category'],
  periodScoped: false,

  columns: [
    { key: 'product', header: 'Product', type: 'text', width: 1.8 },
    { key: 'category', header: 'Category', type: 'text', width: 1.3 },
    {
      key: 'offeredBase',
      header: 'Offered',
      type: 'amount',
      format: (row) => formatAmount(row.offeredBase, row.measurementType),
    },
    {
      key: 'soldBase',
      header: 'Sold',
      type: 'amount',
      format: (row) => formatAmount(row.soldBase, row.measurementType),
    },
    {
      key: 'remainingBase',
      header: 'Remaining',
      type: 'amount',
      format: (row) => formatAmount(row.remainingBase, row.measurementType),
    },
    { key: 'sellThrough', header: 'Sell-through', type: 'percent' },
    { key: 'exhausted', header: 'Exhausted', type: 'bool', width: 0.8 },
    { key: 'productId', header: 'Product ID', type: 'text', pdfHidden: true },
    {
      key: 'measurementType',
      header: 'Measurement',
      type: 'text',
      pdfHidden: true,
    },
  ],

  stats: [
    {
      key: 'products',
      label: 'Products Offered',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      /**
       * Sell-through is the only figure that can legitimately be aggregated
       * across products here: offered/sold/remaining hold grams for WEIGHT,
       * millilitres for VOLUME and a raw count for COUNT, so a grand total
       * would be dimensional nonsense. A ratio is dimensionless, so this
       * weights each product's ratio equally rather than summing amounts.
       */
      key: 'avgSellThrough',
      label: 'Avg Sell-through',
      type: 'percent',
      compute: (rows) =>
        rows.length
          ? rows.reduce((sum, r) => sum + r.sellThrough, 0) / rows.length
          : 0,
    },
    {
      key: 'exhausted',
      label: 'Exhausted',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.exhausted).length,
    },
    {
      key: 'untouched',
      label: 'Nothing Sold',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.soldBase <= 0).length,
    },
  ],

  /**
   * One row per product allocated to the current catalog window.
   *
   * `offeredGrams` / `remainingGrams` are misnamed on the entity: they hold the
   * product's base unit, which is grams only for WEIGHT products. Every amount
   * is therefore formatted through its own product's measurement family and
   * never summed across families — the same rule DashboardService.getStockStatus
   * follows, and the reason this report has no "total offered" card.
   *
   * Sold is derived as offered − remaining rather than read from orders: it is
   * the counter the auto-pause logic actually acts on, so a discrepancy against
   * order history is a signal worth seeing rather than one to paper over.
   */
  async run(ctx) {
    const catalog = await resolveStockCatalog(ctx.db);
    if (!catalog) return [];

    const qb = ctx.db
      .getRepository(ShareCatalogProductStock)
      .createQueryBuilder('s')
      .innerJoin(Products, 'p', 'p.id = s.productId')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      .select('s.productId', 'productId')
      .addSelect("p.name->>'en'", 'product')
      .addSelect('p.measurementType', 'measurementType')
      .addSelect("c.name->>'en'", 'category')
      .addSelect('s.offeredGrams', 'offeredBase')
      .addSelect('s.remainingGrams', 'remainingBase')
      .where('s.shareCatalogId = :catalogId', { catalogId: catalog.id })
      .orderBy("p.name->>'en'", 'ASC')
      .limit(MAX_REPORT_ROWS + 1);

    if (ctx.filters.categoryId) {
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId: ctx.filters.categoryId,
      });
    }

    const raw = await qb.getRawMany<{
      productId: string;
      product: string;
      measurementType: MeasurementType;
      category: string | null;
      offeredBase: string;
      remainingBase: string;
    }>();

    return raw.map((r) => {
      const offeredBase = Number(r.offeredBase ?? 0);
      const remainingBase = Number(r.remainingBase ?? 0);
      // Clamped: a negative would mean remaining exceeded offered, which can
      // only happen if an allocation was edited downward mid-window.
      const soldBase = Math.max(0, offeredBase - remainingBase);

      return {
        productId: r.productId,
        product: r.product,
        category: r.category ?? 'Uncategorised',
        measurementType: r.measurementType ?? MeasurementType.WEIGHT,
        offeredBase,
        soldBase,
        remainingBase,
        sellThrough: offeredBase > 0 ? (soldBase / offeredBase) * 100 : 0,
        exhausted: offeredBase > 0 && remainingBase <= 0,
      };
    });
  },
});
