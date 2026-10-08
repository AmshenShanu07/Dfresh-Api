/**
 * Products in a cart that can't be fulfilled at checkout: the open catalog no
 * longer offers one of its variants, or the cart's total for the product
 * (variant amount × quantity, summed across lines) exceeds the catalog's
 * remaining allocation or — when the customer shops from a specific outlet —
 * that outlet's stock. Browsing only checks one variant at a time, so a cart
 * can hold more than either counter allows; this is the final gate before the
 * order (and its stock deduction) is created.
 */
export function uncoverableProductIds(
  items: {
    productId: string;
    variantId: string | null;
    quantity: number;
    variant?: { weight?: number } | null;
  }[],
  catalog: {
    ShareCatalogProducts?: { variantId?: string | null }[];
    ShareCatalogProductStock?: { productId: string; remainingGrams: number }[];
  },
  outletStock: Map<string, number> | null,
): Set<string> {
  const offeredVariants = new Set(
    (catalog.ShareCatalogProducts ?? []).map((e) => e.variantId),
  );
  const remainingByProduct = new Map(
    (catalog.ShareCatalogProductStock ?? []).map((s) => [
      s.productId,
      Number(s.remainingGrams) || 0,
    ]),
  );

  const needed = new Map<string, number>();
  const blocked = new Set<string>();
  for (const item of items) {
    if (!item.variantId || !offeredVariants.has(item.variantId)) {
      blocked.add(item.productId);
      continue;
    }
    const amount = (item.variant?.weight ?? 0) * (item.quantity ?? 0);
    needed.set(item.productId, (needed.get(item.productId) ?? 0) + amount);
  }

  for (const [productId, amount] of needed) {
    if (amount > (remainingByProduct.get(productId) ?? 0)) {
      blocked.add(productId);
    } else if (outletStock && amount > (outletStock.get(productId) ?? 0)) {
      blocked.add(productId);
    }
  }
  return blocked;
}
