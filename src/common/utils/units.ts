/**
 * Unit helpers. Every product belongs to one measurement family (see
 * MeasurementType) and its stock is stored in that family's base unit:
 *   WEIGHT -> grams (g),  VOLUME -> millilitres (ml),  COUNT -> count.
 *
 * On the wire / in the UI a value carries a display-unit label. These helpers
 * convert to/from the base unit and format for display.
 *
 * Accepts both the ProductUnits enum casing ('KG' | 'ML' | 'COUNT'...) and the
 * lowercase variant casing ('kg' | 'ml' | 'count'...) so it can be reused
 * across the codebase.
 */
import { MeasurementType } from '../enums';

export type Unit =
  | 'KG'
  | 'G'
  | 'L'
  | 'ML'
  | 'COUNT'
  | 'kg'
  | 'g'
  | 'l'
  | 'ml'
  | 'count';

/** Back-compat alias: weight-only callers historically referenced WeightUnit. */
export type WeightUnit = Unit;

/** Display units allowed for each measurement family (base unit last). */
export const UNITS_BY_TYPE: Record<MeasurementType, Unit[]> = {
  [MeasurementType.WEIGHT]: ['kg', 'g'],
  [MeasurementType.VOLUME]: ['l', 'ml'],
  [MeasurementType.COUNT]: ['count'],
};

/** The base unit a family's stock is stored in. */
export function baseUnitFor(type: MeasurementType): Unit {
  switch (type) {
    case MeasurementType.VOLUME:
      return 'ml';
    case MeasurementType.COUNT:
      return 'count';
    case MeasurementType.WEIGHT:
    default:
      return 'g';
  }
}

/** Display units (case-insensitive) valid for the given family. */
export function unitsFor(type: MeasurementType): Unit[] {
  return UNITS_BY_TYPE[type] ?? UNITS_BY_TYPE[MeasurementType.WEIGHT];
}

/** True if `unit` is a valid display unit for the given measurement family. */
export function isUnitInFamily(unit: Unit, type: MeasurementType): boolean {
  const u = String(unit).toLowerCase();
  return unitsFor(type).some((allowed) => allowed.toLowerCase() === u);
}

/**
 * Converts a value in the given display unit to its base unit. kg and L are
 * 1000x their base (g, ml); g, ml and count are already base units.
 */
export function toBase(value: number, unit: Unit): number {
  const v = Number(value) || 0;
  const u = String(unit).toLowerCase();
  return u === 'kg' || u === 'l' ? v * 1000 : v;
}

/**
 * Converts a base-unit amount to a display-friendly { value, unit } pair for the
 * given family: the larger unit (kg / L) only when the amount is a whole number
 * of it (>= 1000 and divisible by 1000), otherwise the base unit. COUNT is
 * always returned as-is.
 */
export function fromBase(
  amount: number,
  type: MeasurementType,
): { value: number; unit: Unit } {
  const a = Number(amount) || 0;
  if (type === MeasurementType.COUNT) {
    return { value: a, unit: 'count' };
  }
  const large = type === MeasurementType.VOLUME ? 'l' : 'kg';
  const base = type === MeasurementType.VOLUME ? 'ml' : 'g';
  if (a >= 1000 && a % 1000 === 0) {
    return { value: a / 1000, unit: large as Unit };
  }
  return { value: a, unit: base as Unit };
}

/** Human-readable stock label, e.g. "2 kg" / "500 ml" / "12 count". */
export function formatAmount(amount: number, type: MeasurementType): string {
  const { value, unit } = fromBase(amount, type);
  return `${value} ${unit}`;
}
