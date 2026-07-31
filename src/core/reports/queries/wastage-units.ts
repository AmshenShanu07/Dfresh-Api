/**
 * Gram normalisation for the wastage report.
 *
 * Wastage data arrives in three incompatible shapes, which is the whole reason
 * this helper exists rather than the report reaching for `toBase` directly:
 *
 *  - ProductVariant.wastageWeight — already in base units (grams), and per the
 *    entity comment only meaningful for WEIGHT products.
 *  - OrderItems.cleanedWeightUnit — a varchar(2), so it can physically only
 *    ever hold 'g' or 'kg'.
 *  - Purchase.quantityUnit / cleanedQntyUnit — the ProductUnits enum, which is
 *    uppercase ('KG', 'G', 'L', 'ML', 'COUNT').
 *
 * `toBase` in common/utils/units takes lowercase display units and treats
 * anything non-kg/l as a 1:1 base amount — which would silently turn a 5 'KG'
 * threshold into 5 grams. This function case-folds first and returns 0 for
 * units outside the weight family instead of guessing, so a VOLUME or COUNT row
 * can never contribute a bogus gram figure to a weight total.
 */
export function toGrams(value: unknown, unit: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;

  switch (String(unit ?? '').trim().toLowerCase()) {
    case 'kg':
      return amount * 1000;
    case 'g':
      return amount;
    default:
      // Volume, count, empty and junk all fall here. Returning 0 keeps a
      // non-weight row from polluting a gram column.
      return 0;
  }
}

/** True when a unit belongs to the weight family this report is limited to. */
export function isWeightUnit(unit: unknown): boolean {
  const normalised = String(unit ?? '').trim().toLowerCase();
  return normalised === 'g' || normalised === 'kg';
}
