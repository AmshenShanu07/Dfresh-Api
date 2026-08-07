import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserLanguage } from 'src/common/enums';
import { MessagesService, flatten } from './messages.service';
import { MESSAGE_DEFAULTS } from './messages.default';
import { FIELD_LIMITS, MESSAGE_LIMITS } from './messages.limits';

const { EN, ML } = UserLanguage;

/** The bundles as checked in — `src/messages`, copied to `dist/messages` on build. */
const SHIPPED_DIR = path.join(__dirname, '../../messages');

/** The built-in text for a key, for asserting the fallback path. */
const defaultText = (key: string) => flatten(MESSAGE_DEFAULTS).get(key);

/**
 * Boots a MessagesService against a throwaway directory. Each bundle is written
 * as given (a string lets a test supply deliberately broken JSON); omit one to
 * exercise the "no file yet" path for that language.
 */
function bootService(bundles: { en?: string | object; ml?: string | object } = {}): {
  service: MessagesService;
  dir: string;
  enFile: string;
  mlFile: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfresh-messages-'));
  for (const lang of [EN, ML]) {
    const contents = bundles[lang];
    if (contents === undefined) continue;
    fs.writeFileSync(
      path.join(dir, `${lang}.json`),
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf8',
    );
  }
  process.env.MESSAGES_DIR = dir;
  const service = new MessagesService();
  service.onModuleInit();
  return {
    service,
    dir,
    enFile: path.join(dir, 'en.json'),
    mlFile: path.join(dir, 'ml.json'),
  };
}

describe('MessagesService', () => {
  const originalEnv = process.env.MESSAGES_DIR;
  let active: MessagesService | null = null;

  beforeEach(() => {
    // Warnings about missing keys are the expected path in several tests.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    active?.onModuleDestroy();
    active = null;
    jest.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.MESSAGES_DIR;
    else process.env.MESSAGES_DIR = originalEnv;
  });

  describe('interpolation', () => {
    it('fills placeholders from the file', () => {
      const { service } = bootService({
        en: { cart: { line: '• {{label}} — ₹{{total}}' } },
      });
      active = service;

      expect(service.get('cart.line', { label: 'Chicken 1 kg', total: 560 })).toBe(
        '• Chicken 1 kg — ₹560',
      );
    });

    it('replaces every occurrence and tolerates inner spaces', () => {
      const { service } = bootService({ en: { t: { x: '{{a}}-{{ a }}-{{a}}' } } });
      active = service;

      expect(service.get('t.x', { a: 'z' })).toBe('z-z-z');
    });

    it('renders an unknown placeholder as nothing rather than leaking it', () => {
      const { service } = bootService({ en: { t: { x: 'Hi {{userName}}!' } } });
      active = service;

      // The message only offers {{name}} — a typo must not reach the customer.
      expect(service.get('t.x', { name: 'Amal' })).toBe('Hi !');
    });

    it('renders numbers and zero, not blanks', () => {
      const { service } = bootService({ en: { t: { x: 'Cleaning: +₹{{charge}}' } } });
      active = service;

      expect(service.get('t.x', { charge: 0 })).toBe('Cleaning: +₹0');
    });
  });

  describe('fallbacks', () => {
    it('uses the built-in text for a key missing from the file', () => {
      const { service } = bootService({ en: { cart: {} } });
      active = service;

      expect(service.get('cart.empty')).toBe(defaultText('cart.empty'));
    });

    it('prefers the file over the built-in text', () => {
      const { service } = bootService({ en: { cart: { empty: 'Nothing here' } } });
      active = service;

      expect(service.get('cart.empty')).toBe('Nothing here');
    });

    it('returns an empty string for a key that exists nowhere', () => {
      const { service } = bootService({ en: {} });
      active = service;

      expect(service.get('nope.not.a.key')).toBe('');
      expect(service.has('nope.not.a.key')).toBe(false);
    });

    it('ignores a non-string value in the file', () => {
      const { service } = bootService({ en: { cart: { empty: { oops: true } } } });
      active = service;

      expect(service.get('cart.empty')).toBe(defaultText('cart.empty'));
    });
  });

  describe('languages', () => {
    it('reads the requested language', () => {
      const { service } = bootService({
        en: { cart: { empty: 'Your cart is empty' } },
        ml: { cart: { empty: 'നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്' } },
      });
      active = service;

      expect(service.get('cart.empty', {}, EN)).toBe('Your cart is empty');
      expect(service.get('cart.empty', {}, ML)).toBe('നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്');
    });

    it('falls back to English for an untranslated key, not to nothing', () => {
      const { service } = bootService({
        en: { cart: { empty: 'Your cart is empty' } },
        ml: { cart: {} },
      });
      active = service;

      expect(service.get('cart.empty', {}, ML)).toBe('Your cart is empty');
    });

    it('falls back to the built-in text when neither file has the key', () => {
      const { service } = bootService({ en: { cart: {} }, ml: { cart: {} } });
      active = service;

      expect(service.get('cart.empty', {}, ML)).toBe(defaultText('cart.empty'));
    });

    it('serves English when there is no ml.json at all', () => {
      const { service, mlFile } = bootService({
        en: { cart: { empty: 'Your cart is empty' } },
      });
      active = service;

      // A missing translation file is deliberately not seeded from the English
      // defaults — that would look like a translation nobody did.
      expect(fs.existsSync(mlFile)).toBe(false);
      expect(service.get('cart.empty', {}, ML)).toBe('Your cart is empty');
    });

    it('keeps English working when ml.json is broken', () => {
      const { service } = bootService({
        en: { cart: { empty: 'Your cart is empty' } },
        ml: '{ "cart": { "empty": "oops"',
      });
      active = service;

      expect(service.get('cart.empty', {}, EN)).toBe('Your cart is empty');
      expect(service.get('cart.empty', {}, ML)).toBe('Your cart is empty');
    });

    it('keeps the last good Malayalam copy when ml.json becomes invalid', () => {
      const { service, mlFile } = bootService({
        en: { cart: { empty: 'Your cart is empty' } },
        ml: { cart: { empty: 'കാർട്ട് ശൂന്യമാണ്' } },
      });
      active = service;

      fs.writeFileSync(mlFile, '{ "cart": { "empty":', 'utf8');
      expect(service.reload(ML)).toBe(false);
      expect(service.get('cart.empty', {}, ML)).toBe('കാർട്ട് ശൂന്യമാണ്');
    });
  });

  describe('the ambient language scope', () => {
    const bundles = {
      en: { cart: { empty: 'Your cart is empty' } },
      ml: { cart: { empty: 'കാർട്ട് ശൂന്യമാണ്' } },
    };

    it('resolves in English outside any scope', () => {
      const { service } = bootService(bundles);
      active = service;

      expect(service.currentLanguage()).toBe(EN);
      expect(service.get('cart.empty')).toBe('Your cart is empty');
    });

    it('resolves in the scoped language', () => {
      const { service } = bootService(bundles);
      active = service;

      const text = service.runWith(ML, () => service.get('cart.empty'));
      expect(text).toBe('കാർട്ട് ശൂന്യമാണ്');
    });

    it('treats a customer who never picked a language as English', () => {
      const { service } = bootService(bundles);
      active = service;

      expect(service.runWith(null, () => service.get('cart.empty'))).toBe(
        'Your cart is empty',
      );
    });

    it('carries the language across awaits', async () => {
      const { service } = bootService(bundles);
      active = service;

      const text = await service.runWith(ML, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return service.get('cart.empty');
      });

      expect(text).toBe('കാർട്ട് ശൂന്യമാണ്');
    });

    it('keeps two overlapping conversations apart', async () => {
      const { service } = bootService(bundles);
      active = service;

      // Interleaved on purpose: one conversation must not pick up the other's
      // language while it is suspended at an await.
      const [malayalam, english] = await Promise.all([
        service.runWith(ML, async () => {
          await new Promise((r) => setTimeout(r, 20));
          return service.get('cart.empty');
        }),
        service.runWith(EN, async () => {
          await new Promise((r) => setTimeout(r, 5));
          return service.get('cart.empty');
        }),
      ]);

      expect(malayalam).toBe('കാർട്ട് ശൂന്യമാണ്');
      expect(english).toBe('Your cart is empty');
    });
  });

  describe('the files themselves', () => {
    it('writes the English defaults out when there is no file yet', () => {
      const { service, enFile } = bootService();
      active = service;

      expect(fs.existsSync(enFile)).toBe(true);
      expect(JSON.parse(fs.readFileSync(enFile, 'utf8'))).toEqual(MESSAGE_DEFAULTS);
    });

    it('keeps the last good copy when the file becomes invalid JSON', () => {
      const { service, enFile } = bootService({
        en: { cart: { empty: 'Cart is empty' } },
      });
      active = service;
      expect(service.get('cart.empty')).toBe('Cart is empty');

      fs.writeFileSync(enFile, '{ "cart": { "empty": "oops"', 'utf8');
      expect(service.reload(EN)).toBe(false);
      expect(service.get('cart.empty')).toBe('Cart is empty');
    });

    it('keeps the last good copy when the file is not an object', () => {
      const { service, enFile } = bootService({
        en: { cart: { empty: 'Cart is empty' } },
      });
      active = service;

      fs.writeFileSync(enFile, '["a", "b"]', 'utf8');
      expect(service.reload(EN)).toBe(false);
      expect(service.get('cart.empty')).toBe('Cart is empty');
    });

    it('picks up an edit on its own, without a restart', async () => {
      const { service, mlFile } = bootService({
        en: { cart: { empty: 'Cart is empty' } },
        ml: { cart: { empty: 'കാർട്ട് ശൂന്യമാണ്' } },
      });
      active = service;

      fs.writeFileSync(
        mlFile,
        JSON.stringify({ cart: { empty: 'Hot reloaded' } }),
        'utf8',
      );

      // The watcher debounces by 300ms; poll rather than sleep a fixed amount.
      // Stay well inside jest's 5s timeout so a real failure reports as a
      // mismatch here rather than as a timeout with nothing to read.
      const deadline = Date.now() + 3000;
      while (
        service.get('cart.empty', {}, ML) !== 'Hot reloaded' &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(service.get('cart.empty', {}, ML)).toBe('Hot reloaded');
      // The other bundle is untouched by its neighbour's edit.
      expect(service.get('cart.empty', {}, EN)).toBe('Cart is empty');
    });

    it('picks up an edit on reload', () => {
      const { service, enFile } = bootService({
        en: { cart: { empty: 'Cart is empty' } },
      });
      active = service;

      fs.writeFileSync(
        enFile,
        JSON.stringify({ cart: { empty: 'Nothing here' } }),
        'utf8',
      );
      expect(service.reload(EN)).toBe(true);
      expect(service.get('cart.empty')).toBe('Nothing here');
    });
  });
});

describe.each([UserLanguage.EN, UserLanguage.ML])('shipped %s.json', (lang) => {
  const file = path.join(SHIPPED_DIR, `${lang}.json`);
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));

  it('parses', () => {
    expect(() => read()).not.toThrow();
  });

  it('has exactly the keys the app knows about', () => {
    const shipped = [...flatten(read()).keys()].sort();
    const known = [...flatten(MESSAGE_DEFAULTS).keys()].sort();

    expect(shipped).toEqual(known);
  });

  it("stays inside WhatsApp's field limits", () => {
    const texts = flatten(read());
    const tooLong = Object.entries(MESSAGE_LIMITS)
      .filter(([key, kind]) => (texts.get(key)?.length ?? 0) > FIELD_LIMITS[kind])
      .map(([key, kind]) => `${key} (${texts.get(key).length} > ${FIELD_LIMITS[kind]})`);

    expect(tooLong).toEqual([]);
  });
});

describe('shipped bundles', () => {
  const read = (lang: UserLanguage) =>
    JSON.parse(
      fs.readFileSync(path.join(SHIPPED_DIR, `${lang}.json`), 'utf8'),
    );

  it("stays inside WhatsApp's field limits in the built-in defaults too", () => {
    const texts = flatten(MESSAGE_DEFAULTS);
    const tooLong = Object.entries(MESSAGE_LIMITS)
      .filter(([key, kind]) => (texts.get(key)?.length ?? 0) > FIELD_LIMITS[kind])
      .map(([key, kind]) => `${key} (${texts.get(key).length} > ${FIELD_LIMITS[kind]})`);

    expect(tooLong).toEqual([]);
  });

  it('only limits keys that exist', () => {
    const texts = flatten(MESSAGE_DEFAULTS);
    const unknown = Object.keys(MESSAGE_LIMITS).filter((key) => !texts.has(key));

    expect(unknown).toEqual([]);
  });

  it('keeps the language prompt identical in every bundle', () => {
    // These three are shown before we know which language the customer reads,
    // so whichever bundle serves them must say the same thing.
    const en = flatten(read(UserLanguage.EN));
    const ml = flatten(read(UserLanguage.ML));

    for (const key of [
      'language.prompt',
      'language.buttonEnglish',
      'language.buttonMalayalam',
    ]) {
      expect(ml.get(key)).toBe(en.get(key));
    }
  });
});
