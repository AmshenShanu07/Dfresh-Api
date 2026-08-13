import { UserLanguage } from 'src/common/enums';
import { LocalizedText, localize } from 'src/common/utils/localized-text';

/** Bucket id for products whose category row is missing or unresolvable. */
export const UNCATEGORIZED_ID = '__other__';
export const UNCATEGORIZED_NAME = 'Other';

/**
 * The shape `groupEntriesByCategory` needs from a ShareCatalogProducts row.
 * Callers pass entries that have *already* been filtered down to the sellable
 * ones — this helper does no stock checking of its own.
 */
export interface SellableEntry {
  productId: string;
  product?: {
    category?: { id?: string; name?: LocalizedText } | null;
  } | null;
}

export interface CategoryRow {
  /** Category.id, or UNCATEGORIZED_ID for the "Other" bucket. */
  id: string;
  name: string;
  /** Distinct sellable products in this category (not variants). */
  productCount: number;
}

/**
 * Groups sellable catalog entries into category rows for the WhatsApp category
 * list. A product with several sellable variants counts once. A product whose
 * category relation is missing (deleted row, unresolved id) falls into the
 * "Other" bucket rather than disappearing — stock is the only visibility gate.
 * Ordered by product count desc, then name asc so the list is stable.
 */
export function groupEntriesByCategory(
  entries: SellableEntry[],
  lang: UserLanguage,
): CategoryRow[] {
  const byCategory = new Map<string, { name: string; productIds: Set<string> }>();

  for (const entry of entries) {
    const category = entry.product?.category;
    const id = category?.id || UNCATEGORIZED_ID;
    const name =
      (id === UNCATEGORIZED_ID ? '' : localize(category?.name, lang)) ||
      UNCATEGORIZED_NAME;

    let bucket = byCategory.get(id);
    if (!bucket) {
      bucket = { name, productIds: new Set<string>() };
      byCategory.set(id, bucket);
    }
    bucket.productIds.add(entry.productId);
  }

  return [...byCategory.entries()]
    .map(([id, bucket]) => ({
      id,
      name: bucket.name,
      productCount: bucket.productIds.size,
    }))
    .sort(
      (a, b) =>
        b.productCount - a.productCount || a.name.localeCompare(b.name),
    );
}

/** The category bucket an entry belongs to — mirrors the grouping above. */
export function categoryIdOf(entry: SellableEntry): string {
  return entry.product?.category?.id || UNCATEGORIZED_ID;
}
