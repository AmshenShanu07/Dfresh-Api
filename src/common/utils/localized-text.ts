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
