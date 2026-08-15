import { UserLanguage } from '../enums';

/**
 * A name/label stored in both languages the bot speaks. Both keys are always
 * present — there is no "untranslated" state at the DB level, since the
 * dashboard requires both on save.
 */
export interface LocalizedText {
  en: string;
  ml: string;
}

/**
 * Picks the text for `lang`, falling back to English if that language's copy
 * is missing (mirrors MessagesService's own EN-fallback semantics).
 */
export function localize(
  text: LocalizedText | null | undefined,
  lang: UserLanguage,
): string {
  return text?.[lang] || text?.en || '';
}

/**
 * TypeORM's `Raw()` operator, used in object-style `where` filters (e.g.
 * `repository.find({ where: { name: Raw(alias => ...) } })`), hands the
 * callback an unquoted `EntityAlias.propertyName` path — not a ready-to-use
 * SQL reference. Interpolating it straight into a template literal lets
 * Postgres case-fold the (case-sensitive) entity alias to lowercase, which
 * then can't be found in the FROM clause TypeORM actually generated
 * ("missing FROM-clause entry for table ..."). Quote each segment so it
 * matches.
 */
export function quoteRawAlias(aliasPath: string): string {
  return aliasPath
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');
}
