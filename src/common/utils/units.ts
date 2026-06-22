/**
 * Stock-quantity unit helpers. Stock is stored everywhere in grams; these
 * convert to/from the display units used in DTOs and the UI.
 *
 * Accepts both the ProductUnits enum casing ('KG' | 'G') and the lowercase
 * variant casing ('kg' | 'g') so it can be reused across the codebase.
 */
export type WeightUnit = 'KG' | 'G' | 'kg' | 'g';

/** Converts a value in the given unit to grams. */
export function toGrams(value: number, unit: WeightUnit): number {
  const v = Number(value) || 0;
  return String(unit).toLowerCase() === 'kg' ? v * 1000 : v;
}

/**
 * Converts grams to a display-friendly { value, unit } pair: kg when the
 * amount is a whole number of kilograms (>= 1000g), otherwise grams.
 */
export function fromGrams(grams: number): { value: number; unit: 'kg' | 'g' } {
  const g = Number(grams) || 0;
  if (g >= 1000 && g % 1000 === 0) {
    return { value: g / 1000, unit: 'kg' };
  }
  return { value: g, unit: 'g' };
}
