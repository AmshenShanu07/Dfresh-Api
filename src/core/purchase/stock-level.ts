import { MeasurementType } from 'src/common/enums';

/**
 * Pure builder behind the Stock Level page: one row per product, combining
 * the live master counter (Products.totalQuantity), the product's latest
 * purchase, and real usage. Kept free of TypeORM so it can be unit-tested.
 *
 * The page used to list raw purchase records, so its "Total Stock" was the
 * purchased amount and never moved when orders were deducted.
 */

/** Days of confirmed sales averaged into "Avg. Daily Usage". */
export const USAGE_WINDOW_DAYS = 7;

export const STOCK_LEVEL_SORTS = [
  'name-asc',
  'name-desc',
  'stock-desc',
  'stock-asc',
  'usage-desc',
  'usage-asc',
] as const;
export type StockLevelSort = (typeof STOCK_LEVEL_SORTS)[number];

export type StockLevelProduct = {
  id: string;
  name: { en?: string; ml?: string } | null;
  categoryId: string;
  measurementType: MeasurementType | null;
  totalQuantity: number;
  threshold: number | null;
};

export type StockLevelPurchase = {
  productId: string;
  quantity: number;
  quantityUnit: string;
  createdAt: Date;
  cleanedQnty: number | null;
  cleanedQntyUnit: string | null;
  releasedQtny: number | null;
  releasedQntyUnit: string | null;
};

export type StockLevelRow = {
  productId: string;
  name: { en?: string; ml?: string } | null;
  categoryId: string;
  measurementType: MeasurementType;
  /** Live stock in base units (g / ml / count). */
  liveStock: number;
  /** Low-stock level in base units, or null when not set. */
  threshold: number | null;
  belowThreshold: boolean;
  /** Average base units sold per day over the last USAGE_WINDOW_DAYS days. */
  avgDailyUsage: number;
  latestPurchase: Omit<StockLevelPurchase, 'productId'> | null;
};

export function buildStockLevelRows(
  products: StockLevelProduct[],
  latestPurchases: StockLevelPurchase[],
  usedByProduct: Map<string, number>,
  opts: { categoryId?: string; sort?: StockLevelSort } = {},
): StockLevelRow[] {
  const purchaseByProduct = new Map(
    latestPurchases.map((p) => [p.productId, p]),
  );

  const rows: StockLevelRow[] = products
    .filter((p) => !opts.categoryId || p.categoryId === opts.categoryId)
    .map((p) => {
      const purchase = purchaseByProduct.get(p.id);
      const liveStock = Number(p.totalQuantity) || 0;
      const threshold = p.threshold == null ? null : Number(p.threshold);
      return {
        productId: p.id,
        name: p.name,
        categoryId: p.categoryId,
        measurementType: p.measurementType ?? MeasurementType.WEIGHT,
        liveStock,
        threshold,
        belowThreshold: threshold != null && liveStock < threshold,
        avgDailyUsage: (usedByProduct.get(p.id) ?? 0) / USAGE_WINDOW_DAYS,
        latestPurchase: purchase
          ? {
              quantity: purchase.quantity,
              quantityUnit: purchase.quantityUnit,
              createdAt: purchase.createdAt,
              cleanedQnty: purchase.cleanedQnty,
              cleanedQntyUnit: purchase.cleanedQntyUnit,
              releasedQtny: purchase.releasedQtny,
              releasedQntyUnit: purchase.releasedQntyUnit,
            }
          : null,
      };
    });

  const nameOf = (r: StockLevelRow) => (r.name?.en ?? '').toLowerCase();
  const compare: Record<
    StockLevelSort,
    (a: StockLevelRow, b: StockLevelRow) => number
  > = {
    'name-asc': (a, b) => nameOf(a).localeCompare(nameOf(b)),
    'name-desc': (a, b) => nameOf(b).localeCompare(nameOf(a)),
    'stock-desc': (a, b) => b.liveStock - a.liveStock,
    'stock-asc': (a, b) => a.liveStock - b.liveStock,
    'usage-desc': (a, b) => b.avgDailyUsage - a.avgDailyUsage,
    'usage-asc': (a, b) => a.avgDailyUsage - b.avgDailyUsage,
  };

  // Default: products under their threshold first, then by name, so the page
  // opens on what needs restocking.
  rows.sort(
    opts.sort
      ? compare[opts.sort]
      : (a, b) =>
          Number(b.belowThreshold) - Number(a.belowThreshold) ||
          compare['name-asc'](a, b),
  );
  return rows;
}
