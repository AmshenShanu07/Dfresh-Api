/**
 * Builds the pattern for a "contains" `ILike(...)` from raw user input.
 *
 * `%` and `_` are SQL wildcards, so an unescaped search for `100%` matches
 * every row and `a_b` matches `axb`. Postgres' default LIKE escape character
 * is a backslash, which therefore has to be escaped first — reversing the
 * order would double-escape the escapes that this function itself adds.
 */
export function likeContains(term: string): string {
  const escaped = term
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return `%${escaped}%`;
}
