import { reconcileStock, StockRow } from './stock-reconcile';

describe('reconcileStock', () => {
  const milk: StockRow = { productId: 'milk', offeredGrams: 3000, remainingGrams: 500 };

  it('adds the delta to an existing product (offered & remaining), preserving sold', () => {
    const res = reconcileStock([milk], [{ productId: 'milk', addBase: 5000 }], ['milk']);
    expect(res.upserts).toEqual([
      { productId: 'milk', offeredGrams: 8000, remainingGrams: 5500 },
    ]);
    expect(res.deletes).toEqual([]);
  });

  it('treats add=0 as a no-op that leaves the row unchanged', () => {
    const res = reconcileStock([milk], [{ productId: 'milk', addBase: 0 }], ['milk']);
    expect(res.upserts).toEqual([
      { productId: 'milk', offeredGrams: 3000, remainingGrams: 500 },
    ]);
    expect(res.deletes).toEqual([]);
  });

  it('inserts a new product row (offered = remaining = add)', () => {
    const res = reconcileStock([], [{ productId: 'egg', addBase: 12 }], ['egg']);
    expect(res.upserts).toEqual([
      { productId: 'egg', offeredGrams: 12, remainingGrams: 12 },
    ]);
  });

  it('skips creating a zero row for a brand-new product with add=0', () => {
    const res = reconcileStock([], [{ productId: 'egg', addBase: 0 }], ['egg']);
    expect(res.upserts).toEqual([]);
  });

  it('deletes rows for products no longer included', () => {
    const res = reconcileStock([milk], [], []);
    expect(res.upserts).toEqual([]);
    expect(res.deletes).toEqual(['milk']);
  });

  it('does not delete anything when includedProductIds is omitted', () => {
    const res = reconcileStock([milk], [{ productId: 'milk', addBase: 1000 }]);
    expect(res.deletes).toEqual([]);
    expect(res.upserts).toEqual([
      { productId: 'milk', offeredGrams: 4000, remainingGrams: 1500 },
    ]);
  });
});
