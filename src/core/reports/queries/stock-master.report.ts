import { MeasurementType, ProductUnits } from 'src/common/enums';
import { formatAmount, toBase, Unit } from 'src/common/utils/units';
import { Products } from '../../product/entities/product.entity';
import { ProductVariant } from '../../product/entities/product-variant.entity';
import { Category } from '../../category/entities/category.entity';
import { Purchase } from '../../purchase/entities/purchase.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS } from '../reports.filters';

export interface StockMasterRow {
  productId: string;
  product: string;
  category: string;
  measurementType: MeasurementType;
  /** Products.totalQuantity — the master counter, in base units. */
  onHandBase: number;
  /** Latest recorded reorder threshold, normalised to base units. Null if unset. */
  thresholdBase: number | null;
  belowThreshold: boolean;
  /** On-hand as a percentage of the threshold; null when no threshold is set. */
  coverage: number | null;
  variants: number;
  lastPurchase: Date | null;
}

export const stockMasterReport = defineReport<StockMasterRow>({
  slug: 'stock-master',
  title: 'Stock & Reorder',
  description:
    'Master stock per product against its latest reorder threshold. A snapshot of stock right now.',
  // Snapshot, not period-scoped: Products.totalQuantity is a live counter with
  // no history, so a date range would be a lie. The registry spec enforces the
  // matching absence of a dateRange filter.
  filters: ['category'],
  periodScoped: false,

  columns: [
    { key: 'product', header: 'Product', type: 'text', width: 1.8 },
    { key: 'category', header: 'Category', type: 'text', width: 1.3 },
    {
      key: 'onHandBase',
      header: 'On Hand',
      type: 'amount',
      format: (row) => formatAmount(row.onHandBase, row.measurementType),
    },
    {
      key: 'thresholdBase',
      header: 'Reorder At',
      type: 'amount',
      format: (row) =>
        row.thresholdBase === null
          ? '—'
          : formatAmount(row.thresholdBase, row.measurementType),
    },
    {
      key: 'coverage',
      header: 'Coverage',
      type: 'percent',
      width: 0.8,
      format: (row) =>
        row.coverage === null ? '—' : `${row.coverage.toFixed(0)}%`,
    },
    { key: 'belowThreshold', header: 'Reorder', type: 'bool', width: 0.7 },
    { key: 'variants', header: 'Variants', type: 'number', width: 0.7 },
    { key: 'lastPurchase', header: 'Last Purchase', type: 'date' },
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
      label: 'Active Products',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'belowThreshold',
      label: 'Need Reordering',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.belowThreshold).length,
    },
    {
      key: 'outOfStock',
      label: 'Out Of Stock',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.onHandBase <= 0).length,
    },
    {
      key: 'noThreshold',
      label: 'No Threshold Set',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.thresholdBase === null).length,
    },
  ],

  /**
   * One row per active product, comparing the master stock counter against the
   * reorder threshold.
   *
   * Two wrinkles worth stating:
   *
   * 1. The threshold lives on Purchase, not on Products — it is recorded per
   *    batch via `PUT /purchase/add-threshold/:id`. So "the product's
   *    threshold" is really the most recently recorded one, picked here with
   *    DISTINCT ON ordered by createdAt DESC. Products whose thresholds were
   *    never set come through as null and are counted separately rather than
   *    being treated as a threshold of zero, which would wrongly report them as
   *    fully stocked.
   *
   * 2. Thresholds are stored with their own ProductUnits ('KG', 'G', 'L', …)
   *    while totalQuantity is always in the product's base unit. They are
   *    normalised through toBase before comparison — otherwise a 5 KG threshold
   *    would read as 5 g and never trigger. toBase takes lowercase units, hence
   *    the case fold.
   *
   * Never compared or summed across measurement families: each row's numbers
   * are formatted in its own family and no cross-product total is offered.
   */
  async run(ctx) {
    // DISTINCT ON is Postgres-specific and is the cheapest way to take the
    // latest row per group without a window-function subquery.
    const thresholdRows = await ctx.db
      .getRepository(Purchase)
      .createQueryBuilder('p')
      .select('DISTINCT ON (p.productId) p.productId', 'productId')
      .addSelect('p.thresholdQnty', 'thresholdQnty')
      .addSelect('p.thresholdQntyUnit', 'thresholdQntyUnit')
      .addSelect('p.createdAt', 'lastPurchase')
      .where('p.thresholdQnty IS NOT NULL')
      .orderBy('p.productId')
      .addOrderBy('p.createdAt', 'DESC')
      .getRawMany<{
        productId: string;
        thresholdQnty: string | null;
        thresholdQntyUnit: ProductUnits | null;
        lastPurchase: Date;
      }>();

    const thresholds = new Map(thresholdRows.map((r) => [r.productId, r]));

    const qb = ctx.db
      .getRepository(Products)
      .createQueryBuilder('p')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      // Entity class, not the raw table name: a string first argument is read
      // as a relation path or entity name, which 'ProductVariants' is neither.
      .leftJoin(ProductVariant, 'v', 'v.productId = p.id AND v.isDeleted = false')
      .leftJoin(Purchase, 'pur', 'pur.productId = p.id')
      .select('p.id', 'productId')
      .addSelect('p.name', 'product')
      .addSelect('p.measurementType', 'measurementType')
      .addSelect('p.totalQuantity', 'onHandBase')
      .addSelect('c.name', 'category')
      .addSelect('COUNT(DISTINCT v.id)', 'variants')
      .addSelect('MAX(pur."createdAt")', 'lastPurchase')
      .where('p.isDeleted = false')
      .andWhere('p.isActive = true')
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('p.measurementType')
      .addGroupBy('p.totalQuantity')
      .addGroupBy('c.name')
      .orderBy('p.name', 'ASC')
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
      onHandBase: string;
      category: string | null;
      variants: string;
      lastPurchase: Date | null;
    }>();

    return raw.map((r) => {
      const measurementType = r.measurementType ?? MeasurementType.WEIGHT;
      const onHandBase = Number(r.onHandBase ?? 0);

      const threshold = thresholds.get(r.productId);
      const thresholdBase =
        threshold?.thresholdQnty != null
          ? toBase(
              Number(threshold.thresholdQnty),
              String(threshold.thresholdQntyUnit ?? '').toLowerCase() as Unit,
            )
          : null;

      return {
        productId: r.productId,
        product: r.product,
        category: r.category ?? 'Uncategorised',
        measurementType,
        onHandBase,
        thresholdBase,
        // A product with no threshold recorded is "unknown", not "fine" — it is
        // surfaced by its own stat card instead of being flagged for reorder.
        belowThreshold: thresholdBase !== null && onHandBase < thresholdBase,
        coverage:
          thresholdBase !== null && thresholdBase > 0
            ? (onHandBase / thresholdBase) * 100
            : null,
        variants: Number(r.variants ?? 0),
        lastPurchase: r.lastPurchase,
      };
    });
  },
});
