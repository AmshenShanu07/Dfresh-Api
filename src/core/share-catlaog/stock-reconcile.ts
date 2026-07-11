export interface StockRow {
  productId: string;
  offeredGrams: number;
  remainingGrams: number;
}

export interface StockDelta {
  productId: string;
  addBase: number;
}

export interface StockReconcileResult {
  upserts: StockRow[];
  deletes: string[];
}

/**
 * Pure additive reconcile for per-product share-catalog stock.
 * - Existing product + delta  -> offered/remaining += addBase (sold preserved).
 * - New product with add > 0   -> insert offered = remaining = addBase.
 * - New product with add <= 0  -> skipped (no zero rows).
 * - Existing product no longer in `includedProductIds` -> deleted.
 * When `includedProductIds` is omitted, nothing is deleted.
 */
export function reconcileStock(
  existing: StockRow[],
  deltas: StockDelta[],
  includedProductIds?: string[],
): StockReconcileResult {
  const byProduct = new Map(existing.map((r) => [r.productId, r]));
  const upserts: StockRow[] = [];

  for (const { productId, addBase } of deltas) {
    const row = byProduct.get(productId);
    if (row) {
      upserts.push({
        productId,
        offeredGrams: row.offeredGrams + addBase,
        remainingGrams: row.remainingGrams + addBase,
      });
    } else if (addBase > 0) {
      upserts.push({ productId, offeredGrams: addBase, remainingGrams: addBase });
    }
  }

  const deletes =
    includedProductIds === undefined
      ? []
      : existing
          .filter((r) => !includedProductIds.includes(r.productId))
          .map((r) => r.productId);

  return { upserts, deletes };
}
