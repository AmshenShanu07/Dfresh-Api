import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import * as fs from 'fs';
import * as path from 'path';
import { UserLanguage } from 'src/common/enums';
import { MESSAGE_DEFAULTS, MessageTree } from './messages.default';
import { FIELD_LIMITS, MESSAGE_LIMITS } from './messages.limits';

/** The languages we ship a bundle for. */
const LANGUAGES: UserLanguage[] = [UserLanguage.EN, UserLanguage.ML];

/**
 * Serves every customer-facing text from editable JSON files, one per language.
 *
 * The files live outside `src/` (default `<cwd>/messages/{en,ml}.json`) so they
 * survive `nest build` and can be edited straight on the server. Edits are
 * picked up automatically — no restart, no rebuild.
 *
 * Nothing here throws. A key resolves through three layers — the requested
 * language's file, then the English file, then MESSAGE_DEFAULTS — so an
 * untranslated key reads as English rather than as nothing. A file that fails
 * to parse is ignored in favour of the last version that worked, so a bad edit
 * can never stop the bot from replying.
 *
 * Which language a `get()` resolves in is ambient: callers open a scope with
 * `runWith(lang, fn)` once per conversation, and every lookup inside it — however
 * deep — follows. See the note on `context` below.
 */
@Injectable()
export class MessagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagesService.name);

  /** Last successfully parsed contents of each language file. */
  private readonly bundles: Record<UserLanguage, MessageTree> = {
    [UserLanguage.EN]: {},
    [UserLanguage.ML]: {},
  };

  /**
   * The language the current call chain is speaking.
   *
   * WhatsappService resolves a customer's language once, at the entry point,
   * and wraps the rest of the work in `runWith`. Threading the language through
   * the ~50 methods and 143 lookups below that entry point by hand would be a
   * standing invitation to miss one; AsyncLocalStorage carries it across every
   * `await` instead. Concurrent conversations each get their own scope.
   */
  private readonly context = new AsyncLocalStorage<UserLanguage>();

  private watcher: fs.FSWatcher | null = null;
  private readonly reloadTimers = new Map<UserLanguage, NodeJS.Timeout>();

  /** Keys already reported as missing / with a bad token, so logs stay quiet. */
  private readonly warned = new Set<string>();

  readonly dirPath: string =
    process.env.MESSAGES_DIR || path.join(process.cwd(), 'messages');

  onModuleInit() {
    this.seedIfMissing();
    for (const lang of LANGUAGES) {
      this.load(lang);
      this.validate(lang);
    }
    this.watch();
  }

  onModuleDestroy() {
    for (const timer of this.reloadTimers.values()) clearTimeout(timer);
    this.reloadTimers.clear();
    this.watcher?.close();
    this.watcher = null;
  }

  /** Absolute path of a language's file. */
  fileFor(lang: UserLanguage): string {
    return path.join(this.dirPath, `${lang}.json`);
  }

  // ---------------------------------------------------------------------------
  // Language scope
  // ---------------------------------------------------------------------------

  /**
   * Runs `fn` with every `get()` inside it — including inside awaited calls —
   * resolving in `lang`. A null/undefined language means the customer has never
   * picked one, which reads as English.
   */
  runWith<T>(lang: UserLanguage | null | undefined, fn: () => T): T {
    return this.context.run(lang ?? UserLanguage.EN, fn);
  }

  /** The language in scope right now, or EN outside any scope. */
  currentLanguage(): UserLanguage {
    return this.context.getStore() ?? UserLanguage.EN;
  }

  // ---------------------------------------------------------------------------
  // Lookup + interpolation
  // ---------------------------------------------------------------------------

  /**
   * Returns the text for a dotted key with its `{{placeholders}}` filled in.
   *
   * Lookup order: the requested language's file, the English file, then the
   * built-in default. `lang` defaults to the ambient language. A token with no
   * matching value renders as an empty string rather than leaking `{{token}}`
   * into a customer's chat.
   */
  get(
    key: string,
    vars: Record<string, unknown> = {},
    lang: UserLanguage = this.currentLanguage(),
  ): string {
    const template = this.resolve(key, lang);
    if (template === null) {
      this.warnOnce(`missing:${key}`, `No text found for message key "${key}"`);
      return '';
    }
    return this.interpolate(template, vars, key);
  }

  /** True when the key exists in a file or in the defaults. */
  has(key: string, lang: UserLanguage = this.currentLanguage()): boolean {
    return this.resolve(key, lang) !== null;
  }

  /** Re-reads a language's file immediately. Returns false if it could not be parsed. */
  reload(lang: UserLanguage): boolean {
    return this.load(lang);
  }

  private resolve(key: string, lang: UserLanguage): string | null {
    const fromLang = lookup(this.bundles[lang], key);
    if (typeof fromLang === 'string') return fromLang;

    // An untranslated key falls through to English before the built-in text, so
    // a half-finished translation never shows a customer a blank message.
    if (lang !== UserLanguage.EN) {
      const fromEnglish = lookup(this.bundles[UserLanguage.EN], key);
      if (typeof fromEnglish === 'string') return fromEnglish;
    }

    const fromDefaults = lookup(MESSAGE_DEFAULTS, key);
    return typeof fromDefaults === 'string' ? fromDefaults : null;
  }

  private interpolate(
    template: string,
    vars: Record<string, unknown>,
    key: string,
  ): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token: string) => {
      const value = vars[token];
      if (value === undefined || value === null) {
        this.warnOnce(
          `token:${key}:${token}`,
          `Message "${key}" uses {{${token}}}, which is not a value this message provides — it will render as nothing.`,
        );
        return '';
      }
      return String(value);
    });
  }

  private warnOnce(id: string, message: string) {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    this.logger.warn(message);
  }

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  /**
   * Writes `en.json` out on first boot so there is always a file to edit. The
   * defaults are English, so a missing `ml.json` is deliberately *not* seeded —
   * a file of English text under an `ml` name would read as a translation that
   * had already been done. It falls back to English at lookup time instead.
   */
  private seedIfMissing() {
    const englishFile = this.fileFor(UserLanguage.EN);
    try {
      if (!fs.existsSync(englishFile)) {
        fs.mkdirSync(this.dirPath, { recursive: true });
        fs.writeFileSync(
          englishFile,
          JSON.stringify(MESSAGE_DEFAULTS, null, 2) + '\n',
          'utf8',
        );
        this.logger.log(`Created message file at ${englishFile}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Could not create ${englishFile}: ${error?.message || error}. Using built-in texts.`,
      );
    }

    for (const lang of LANGUAGES) {
      if (lang === UserLanguage.EN) continue;
      const file = this.fileFor(lang);
      if (!fs.existsSync(file)) {
        this.logger.warn(
          `No ${path.basename(file)} found in ${this.dirPath}; "${lang}" customers will be replied to in English until it is added.`,
        );
      }
    }
  }

  /** Parses one language file into `bundles`; keeps the previous copy on failure. */
  private load(lang: UserLanguage): boolean {
    const file = this.fileFor(lang);

    // A language file that was never created is not an error — English covers it.
    if (!fs.existsSync(file)) return false;

    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.logger.error(
          `${file} must contain a JSON object. Keeping the previous texts.`,
        );
        return false;
      }
      this.bundles[lang] = parsed as MessageTree;
      // A key that was missing before may exist now — let it warn again.
      this.warned.clear();
      this.logger.log(`Loaded ${lang} messages from ${file}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Could not read ${file}: ${error?.message || error}. Keeping the previous texts.`,
      );
      return false;
    }
  }

  /**
   * Watches the *directory* rather than the individual files. Editors and `scp`
   * replace a file instead of writing into it, which detaches a file-level watch
   * after the first save.
   */
  private watch() {
    const namesToLang = new Map<string, UserLanguage>(
      LANGUAGES.map((lang) => [`${lang}.json`, lang]),
    );

    try {
      this.watcher = fs.watch(this.dirPath, (_event, changed) => {
        const lang = changed ? namesToLang.get(changed) : undefined;
        if (!lang) return;

        clearTimeout(this.reloadTimers.get(lang));
        // Debounce: a single save can emit several events.
        this.reloadTimers.set(
          lang,
          setTimeout(() => {
            if (this.load(lang)) this.validate(lang);
          }, 300),
        );
      });
      this.watcher.on('error', (error) =>
        this.logger.error(`Message file watcher stopped: ${error?.message || error}`),
      );
      this.logger.log(`Watching ${this.dirPath} for message changes`);
    } catch (error: any) {
      this.logger.warn(
        `Could not watch ${this.dirPath} (${error?.message || error}). Changes will need a restart.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Startup checks — log only, never fatal
  // ---------------------------------------------------------------------------

  private validate(lang: UserLanguage) {
    const file = this.fileFor(lang);
    const defaultKeys = flatten(MESSAGE_DEFAULTS);
    const fileKeys = flatten(this.bundles[lang]);

    const missing = [...defaultKeys.keys()].filter((k) => !fileKeys.has(k));
    if (missing.length) {
      const fallback =
        lang === UserLanguage.EN ? 'the built-in text' : 'the English text';
      this.logger.warn(
        `${missing.length} message key(s) missing from ${file}; ${fallback} is used for: ${missing.join(', ')}`,
      );
    }

    const unknown = [...fileKeys.keys()].filter((k) => !defaultKeys.has(k));
    if (unknown.length) {
      this.logger.warn(
        `${unknown.length} key(s) in ${file} are not used by the app (typo?): ${unknown.join(', ')}`,
      );
    }

    for (const [key, kind] of Object.entries(MESSAGE_LIMITS)) {
      // Measure what a customer in this language would actually receive, which
      // may be the English text or the built-in default rather than this file's.
      const text = this.resolve(key, lang);
      if (typeof text !== 'string') continue;
      const limit = FIELD_LIMITS[kind];
      if (text.length > limit) {
        this.logger.warn(
          `"${key}" is ${text.length} characters for ${lang} but WhatsApp allows ${limit} for a ${kind}. Messages using it may be rejected.`,
        );
      }
    }
  }
}

/** Reads a dotted path out of a nested object. */
function lookup(tree: MessageTree, key: string): unknown {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Flattens a nested tree into `{ 'a.b': 'text' }`. Non-strings are skipped. */
export function flatten(tree: MessageTree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.set(full, value);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of flatten(value as MessageTree, full)) out.set(k, v);
    }
  }
  return out;
}
