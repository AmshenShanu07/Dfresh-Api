/**
 * Coerces a pagination query param to a positive integer, falling back on
 * anything unusable — undefined, NaN, zero, negatives, junk strings.
 *
 * NaN is the case that matters. The global ValidationPipe's `transform: true`
 * coerces an absent `@Query('count') count: number` to NaN rather than leaving
 * it undefined, and NaN is not nullish — so a plain `?? 10` never fires and
 * TypeORM rejects the NaN skip with a 500. Guarding on finiteness catches it.
 */
export function positiveIntOr(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
