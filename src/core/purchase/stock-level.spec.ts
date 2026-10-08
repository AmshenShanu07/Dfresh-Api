import { MeasurementType } from 'src/common/enums';
import { buildStockLevelRows, StockLevelProduct } from './stock-level';

/**
 * The Stock Level page used to list purchase records, so "Total Stock" was the
 * purchased amount and never reflected sales. Rows are now per product and
 * read the live master counter.
 */
const product = (over: Partial<StockLevelProduct>): StockLevelProduct => ({
  id: 'p1',
  name: { en: 'Pearl Spot' },
  categoryId: 'fish',
  measurementType: MeasurementType.WEIGHT,
  totalQuantity: 497_998.5,
  threshold: null,
  ...over,
});

describe('buildStockLevelRows', () => {
  it('reports live stock, latest purchase and 7-day average usage', () => {
    const [row] = buildStockLevelRows(
      [product({})],
      [
        {
          productId: 'p1',
          quantity: 500,
          quantityUnit: 'KG',
          createdAt: new Date('2026-10-07'),
          cleanedQnty: null,
          cleanedQntyUnit: null,
          releasedQtny: null,
          releasedQntyUnit: null,
        },
      ],
      new Map([['p1', 14_000]]),
    );

    expect(row.liveStock).toBe(497_998.5);
    expect(row.latestPurchase?.quantity).toBe(500);
    expect(row.avgDailyUsage).toBe(2_000);
  });

  it('flags products below threshold and lists them first by default', () => {
    const rows = buildStockLevelRows(
      [
        product({
          id: 'a',
          name: { en: 'Apple' },
          totalQuantity: 900,
          threshold: 500,
        }),
        product({
          id: 'z',
          name: { en: 'Zucchini' },
          totalQuantity: 100,
          threshold: 500,
        }),
      ],
      [],
      new Map(),
    );

    expect(rows.map((r) => r.productId)).toEqual(['z', 'a']);
    expect(rows[0].belowThreshold).toBe(true);
    expect(rows[1].belowThreshold).toBe(false);
  });

  it('filters by category and honours an explicit sort', () => {
    const rows = buildStockLevelRows(
      [
        product({ id: 'a', categoryId: 'fish', totalQuantity: 1 }),
        product({ id: 'b', categoryId: 'fish', totalQuantity: 5 }),
        product({ id: 'c', categoryId: 'veg', totalQuantity: 9 }),
      ],
      [],
      new Map(),
      { categoryId: 'fish', sort: 'stock-desc' },
    );

    expect(rows.map((r) => r.productId)).toEqual(['b', 'a']);
  });
});
