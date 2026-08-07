/**
 * Reusable class-transformer `@Transform` handlers for query-param DTOs.
 */

/**
 * Query params always arrive as strings. `@Type(() => Boolean)` is not usable
 * here: it goes through JS truthiness, so the string `"false"` becomes `true`
 * and a "show only inactive" filter silently returns everything.
 *
 * Absent/empty collapses to `undefined` so `@IsOptional()` skips validation
 * (an unset dropdown sends `?isActive=`); anything that is neither literal
 * `true` nor `false` is passed through untouched so `@IsBoolean()` rejects it
 * with a 400 rather than being guessed at.
 */
export const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};
