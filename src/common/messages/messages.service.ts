import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { MESSAGE_DEFAULTS, MessageTree } from './messages.default';
import { FIELD_LIMITS, MESSAGE_LIMITS } from './messages.limits';

/**
 * Serves every customer-facing text from an editable JSON file.
 *
 * The file lives outside `src/` (default `<cwd>/messages/messages.json`) so it
 * survives `nest build` and can be edited straight on the server. Edits are
 * picked up automatically — no restart, no rebuild.
 *
 * Nothing here throws: a missing key falls back to MESSAGE_DEFAULTS, and a file
 * that fails to parse is ignored in favour of the last version that worked, so
 * a bad edit can never stop the bot from replying.
 */
@Injectable()
export class MessagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagesService.name);

  /** Last successfully parsed contents of the JSON file. */
  private overrides: MessageTree = {};

  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

  /** Keys already reported as missing / with a bad token, so logs stay quiet. */
  private readonly warned = new Set<string>();

  readonly filePath: string =
    process.env.MESSAGES_FILE || path.join(process.cwd(), 'messages', 'messages.json');

  onModuleInit() {
    this.seedIfMissing();
    this.load();
    this.validate();
    this.watch();
  }

  onModuleDestroy() {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.watcher = null;
  }

  /**
   * Returns the text for a dotted key with its `{{placeholders}}` filled in.
   *
   * Lookup order: the JSON file, then the built-in default. A token with no
   * matching value renders as an empty string rather than leaking `{{token}}`
   * into a customer's chat.
   */
  get(key: string, vars: Record<string, unknown> = {}): string {
    const template = this.resolve(key);
    if (template === null) {
      this.warnOnce(`missing:${key}`, `No text found for message key "${key}"`);
      return '';
    }
    return this.interpolate(template, vars, key);
  }

  /** True when the key exists in the file or the defaults. */
  has(key: string): boolean {
    return this.resolve(key) !== null;
  }

  /** Re-reads the file immediately. Returns false if it could not be parsed. */
  reload(): boolean {
    return this.load();
  }

  // ---------------------------------------------------------------------------
  // Lookup + interpolation
  // ---------------------------------------------------------------------------

  private resolve(key: string): string | null {
    const fromFile = lookup(this.overrides, key);
    if (typeof fromFile === 'string') return fromFile;
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

  /** Writes the defaults out on first boot so there is always a file to edit. */
  private seedIfMissing() {
    try {
      if (fs.existsSync(this.filePath)) return;
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(MESSAGE_DEFAULTS, null, 2) + '\n',
        'utf8',
      );
      this.logger.log(`Created message file at ${this.filePath}`);
    } catch (error: any) {
      this.logger.error(
        `Could not create ${this.filePath}: ${error?.message || error}. Using built-in texts.`,
      );
    }
  }

  /** Parses the file into `overrides`; keeps the previous copy on failure. */
  private load(): boolean {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.logger.error(
          `${this.filePath} must contain a JSON object. Keeping the previous texts.`,
        );
        return false;
      }
      this.overrides = parsed as MessageTree;
      // A key that was missing before may exist now — let it warn again.
      this.warned.clear();
      this.logger.log(`Loaded messages from ${this.filePath}`);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Could not read ${this.filePath}: ${error?.message || error}. Keeping the previous texts.`,
      );
      return false;
    }
  }

  /**
   * Watches the *directory* rather than the file. Editors and `scp` replace the
   * file instead of writing into it, which detaches a file-level watch after
   * the first save.
   */
  private watch() {
    const dir = path.dirname(this.filePath);
    const name = path.basename(this.filePath);
    try {
      this.watcher = fs.watch(dir, (_event, changed) => {
        if (changed && changed !== name) return;
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        // Debounce: a single save can emit several events.
        this.reloadTimer = setTimeout(() => {
          if (this.load()) this.validate();
        }, 300);
      });
      this.watcher.on('error', (error) =>
        this.logger.error(`Message file watcher stopped: ${error?.message || error}`),
      );
      this.logger.log(`Watching ${this.filePath} for changes`);
    } catch (error: any) {
      this.logger.warn(
        `Could not watch ${this.filePath} (${error?.message || error}). Changes will need a restart.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Startup checks — log only, never fatal
  // ---------------------------------------------------------------------------

  private validate() {
    const defaultKeys = flatten(MESSAGE_DEFAULTS);
    const fileKeys = flatten(this.overrides);

    const missing = [...defaultKeys.keys()].filter((k) => !fileKeys.has(k));
    if (missing.length) {
      this.logger.warn(
        `${missing.length} message key(s) missing from ${this.filePath}; the built-in text is used for: ${missing.join(', ')}`,
      );
    }

    const unknown = [...fileKeys.keys()].filter((k) => !defaultKeys.has(k));
    if (unknown.length) {
      this.logger.warn(
        `${unknown.length} key(s) in ${this.filePath} are not used by the app (typo?): ${unknown.join(', ')}`,
      );
    }

    for (const [key, kind] of Object.entries(MESSAGE_LIMITS)) {
      const text = fileKeys.get(key) ?? defaultKeys.get(key);
      if (typeof text !== 'string') continue;
      const limit = FIELD_LIMITS[kind];
      if (text.length > limit) {
        this.logger.warn(
          `"${key}" is ${text.length} characters but WhatsApp allows ${limit} for a ${kind}. Messages using it may be rejected.`,
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
