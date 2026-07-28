import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MessagesService, flatten } from './messages.service';
import { MESSAGE_DEFAULTS } from './messages.default';
import { FIELD_LIMITS, MESSAGE_LIMITS } from './messages.limits';

/** The built-in text for a key, for asserting the fallback path. */
const defaultText = (key: string) => flatten(MESSAGE_DEFAULTS).get(key);

/**
 * Boots a MessagesService against a throwaway file. `contents` is written as
 * given (a string lets a test supply deliberately broken JSON); omit it to
 * exercise the "no file yet" path.
 */
function bootService(contents?: string | object): {
  service: MessagesService;
  file: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfresh-messages-'));
  const file = path.join(dir, 'messages.json');
  if (contents !== undefined) {
    fs.writeFileSync(
      file,
      typeof contents === 'string' ? contents : JSON.stringify(contents),
      'utf8',
    );
  }
  process.env.MESSAGES_FILE = file;
  const service = new MessagesService();
  service.onModuleInit();
  return { service, file };
}

describe('MessagesService', () => {
  const originalEnv = process.env.MESSAGES_FILE;
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
    if (originalEnv === undefined) delete process.env.MESSAGES_FILE;
    else process.env.MESSAGES_FILE = originalEnv;
  });

  describe('interpolation', () => {
    it('fills placeholders from the file', () => {
      const { service } = bootService({ cart: { line: '• {{label}} — ₹{{total}}' } });
      active = service;

      expect(service.get('cart.line', { label: 'Chicken 1 kg', total: 560 })).toBe(
        '• Chicken 1 kg — ₹560',
      );
    });

    it('replaces every occurrence and tolerates inner spaces', () => {
      const { service } = bootService({ t: { x: '{{a}}-{{ a }}-{{a}}' } });
      active = service;

      expect(service.get('t.x', { a: 'z' })).toBe('z-z-z');
    });

    it('renders an unknown placeholder as nothing rather than leaking it', () => {
      const { service } = bootService({ t: { x: 'Hi {{userName}}!' } });
      active = service;

      // The message only offers {{name}} — a typo must not reach the customer.
      expect(service.get('t.x', { name: 'Amal' })).toBe('Hi !');
    });

    it('renders numbers and zero, not blanks', () => {
      const { service } = bootService({ t: { x: 'Cleaning: +₹{{charge}}' } });
      active = service;

      expect(service.get('t.x', { charge: 0 })).toBe('Cleaning: +₹0');
    });
  });

  describe('fallbacks', () => {
    it('uses the built-in text for a key missing from the file', () => {
      const { service } = bootService({ cart: {} });
      active = service;

      expect(service.get('cart.empty')).toBe(defaultText('cart.empty'));
    });

    it('prefers the file over the built-in text', () => {
      const { service } = bootService({ cart: { empty: 'നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്' } });
      active = service;

      expect(service.get('cart.empty')).toBe('നിങ്ങളുടെ കാർട്ട് ശൂന്യമാണ്');
    });

    it('returns an empty string for a key that exists nowhere', () => {
      const { service } = bootService({});
      active = service;

      expect(service.get('nope.not.a.key')).toBe('');
      expect(service.has('nope.not.a.key')).toBe(false);
    });

    it('ignores a non-string value in the file', () => {
      const { service } = bootService({ cart: { empty: { oops: true } } });
      active = service;

      expect(service.get('cart.empty')).toBe(defaultText('cart.empty'));
    });
  });

  describe('the file itself', () => {
    it('writes the defaults out when there is no file yet', () => {
      const { service, file } = bootService();
      active = service;

      expect(fs.existsSync(file)).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(MESSAGE_DEFAULTS);
    });

    it('keeps the last good copy when the file becomes invalid JSON', () => {
      const { service, file } = bootService({ cart: { empty: 'Cart is empty' } });
      active = service;
      expect(service.get('cart.empty')).toBe('Cart is empty');

      fs.writeFileSync(file, '{ "cart": { "empty": "oops"', 'utf8');
      expect(service.reload()).toBe(false);
      expect(service.get('cart.empty')).toBe('Cart is empty');
    });

    it('keeps the last good copy when the file is not an object', () => {
      const { service, file } = bootService({ cart: { empty: 'Cart is empty' } });
      active = service;

      fs.writeFileSync(file, '["a", "b"]', 'utf8');
      expect(service.reload()).toBe(false);
      expect(service.get('cart.empty')).toBe('Cart is empty');
    });

    it('picks up an edit on its own, without a restart', async () => {
      const { service, file } = bootService({ cart: { empty: 'Cart is empty' } });
      active = service;

      fs.writeFileSync(file, JSON.stringify({ cart: { empty: 'Hot reloaded' } }), 'utf8');

      // The watcher debounces by 300ms; poll rather than sleep a fixed amount.
      const deadline = Date.now() + 5000;
      while (service.get('cart.empty') !== 'Hot reloaded' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(service.get('cart.empty')).toBe('Hot reloaded');
    });

    it('picks up an edit on reload', () => {
      const { service, file } = bootService({ cart: { empty: 'Cart is empty' } });
      active = service;

      fs.writeFileSync(file, JSON.stringify({ cart: { empty: 'Nothing here' } }), 'utf8');
      expect(service.reload()).toBe(true);
      expect(service.get('cart.empty')).toBe('Nothing here');
    });
  });
});

describe('shipped messages.json', () => {
  const file = path.join(process.cwd(), 'messages', 'messages.json');

  it('parses', () => {
    expect(() => JSON.parse(fs.readFileSync(file, 'utf8'))).not.toThrow();
  });

  it('has exactly the keys the app knows about', () => {
    const shipped = [...flatten(JSON.parse(fs.readFileSync(file, 'utf8'))).keys()].sort();
    const known = [...flatten(MESSAGE_DEFAULTS).keys()].sort();

    expect(shipped).toEqual(known);
  });

  it("stays inside WhatsApp's field limits", () => {
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
});
