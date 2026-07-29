import * as fontkit from 'fontkit';
import { inflateSync } from 'zlib';
import { join } from 'path';
import { InvoiceService } from './invoice.service';

const FONT_DIR = join(__dirname, '../../assets/fonts');

/**
 * Names of the glyphs a PDF actually embeds. pdfkit subsets the font, so the
 * subset carries no glyph names of its own — recover them by matching each
 * subsetted outline back to the original face.
 */
const subsetGlyphNames = (pdf: Buffer): string[] => {
  const originals = ['NotoSansMalayalam-Regular.ttf', 'NotoSansMalayalam-Bold.ttf']
    .map((f) => fontkit.openSync(join(FONT_DIR, f)) as any)
    .flatMap((font) =>
      Array.from({ length: font.numGlyphs }, (_, i) => font.getGlyph(i)),
    );
  const byOutline = new Map<string, string>();
  for (const g of originals) {
    const d = g.path.toSVG();
    if (d && !byOutline.has(d)) byOutline.set(d, g.name);
  }

  const raw = pdf.toString('latin1');
  const names: string[] = [];
  for (const id of new Set(Array.from(raw.matchAll(/\/FontFile2 (\d+) 0 R/g), (m) => m[1]))) {
    const objStart = raw.indexOf(`\n${id} 0 obj`);
    const keyword = raw.indexOf('stream', objStart);
    const dict = raw.slice(objStart, keyword);
    let start = keyword + 'stream'.length;
    if (raw[start] === '\r') start++;
    if (raw[start] === '\n') start++;
    const data = pdf.subarray(start, raw.indexOf('endstream', start));
    const font: any = fontkit.create(/FlateDecode/.test(dict) ? inflateSync(data) : data);
    for (let i = 1; i < font.numGlyphs; i++) {
      const name = byOutline.get(font.getGlyph(i).path.toSVG());
      if (name) names.push(name);
    }
  }
  return names;
};

/**
 * Guards two distinct failures:
 *
 * 1. Malayalam product names must actually render. pdfkit's built-in Helvetica is
 *    Latin-only and silently emits blank/notdef glyphs rather than throwing, so the
 *    meaningful assertion is that a Malayalam-capable font is *embedded*.
 * 2. fontkit@2.0.4 hard-crashes shaping common Malayalam conjuncts
 *    ("Cannot read properties of null (reading 'xCoordinate')") unless the `abvm`
 *    OpenType feature is disabled. "വെണ്ടയ്ക്ക" (okra) reproduces it.
 */
const order = (productName: string) => ({
  id: 'ord-1',
  createdAt: new Date('2026-07-29T10:00:00Z'),
  status: 'CONFIRMED',
  paymentMethod: 'COD',
  totalAmount: 250,
  user: { name: 'Test Customer', phone: '9999999999' },
  deliveryDetails: {
    name: 'Test Customer',
    phone: '9999999999',
    address: 'Kochi',
    pinCode: '682001',
  },
  orderItems: [
    {
      id: 'item-1',
      quantity: 2,
      price: 125,
      totalPrice: 250,
      cleaning: false,
      cutting: false,
      product: { name: productName },
      variant: { weight: 500 },
    },
  ],
});

describe('InvoiceService — Malayalam', () => {
  const service = new InvoiceService();

  it('embeds a Malayalam-capable font in the bill', async () => {
    const buf = await service.generateBill(order('വെണ്ടയ്ക്ക'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });

  it('does not crash shaping conjunct-heavy Malayalam', async () => {
    for (const name of ['മുരിങ്ങയ്ക്ക', 'വെണ്ടയ്ക്ക', 'കാബേജ്', 'പച്ചമുളക്']) {
      const buf = await service.generateBill(order(name));
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it('renders a mixed English/Malayalam name', async () => {
    const buf = await service.generateBill(order('Spinach / ചീര'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  /**
   * A Latin prefix used to drag the trailing Malayalam into the Latin shaper, so
   * "Banana വാഴപ്പഴം" printed as "Banana വഴപ്പഴം" — the ാ lost its advance and the
   * പ്പ conjunct fell apart into pa + virama + pa. Asserting only "%PDF" never
   * caught that, so this checks the glyphs the PDF actually embeds: a correctly
   * shaped bill subsets the papamlym conjunct and never needs a bare virama.
   */
  it('forms the പ്പ conjunct when the name starts in English', async () => {
    const subset = subsetGlyphNames(await service.generateBill(order('Banana വാഴപ്പഴം')));
    expect(subset).toContain('papamlym');
    expect(subset).not.toContain('viramamlym');
  });

  it('shapes the Malayalam tail the same with or without a Latin prefix', async () => {
    const mixed = subsetGlyphNames(await service.generateBill(order('Banana വാഴപ്പഴം')));
    const pure = subsetGlyphNames(await service.generateBill(order('വാഴപ്പഴം')));
    const malayalam = (names: string[]) => names.filter((n) => n.endsWith('mlym')).sort();
    expect(malayalam(mixed)).toEqual(malayalam(pure));
  });

  it('renders the label, including its continued-text chain', async () => {
    const o = order('വെണ്ടയ്ക്ക');
    const buf = await service.generateLabel(o.orderItems[0], o);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.toString('latin1')).toContain('NotoSansMalayalam');
  });

  it('prints amounts with the rupee sign', async () => {
    const buf = await service.generateBill(order('തക്കാളി'));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect((service as any).money(250)).toBe('₹ 250.00');
  });
});
