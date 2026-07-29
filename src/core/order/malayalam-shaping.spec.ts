import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { applyMalayalamShaping, splitScriptRuns } from './malayalam-shaping';

/**
 * Guards the mixed-script defect: pdfkit's EmbeddedFont.layout() shapes the whole
 * string as a single run whenever `features` are passed, so a Latin prefix makes
 * fontkit shape the trailing Malayalam with the Latin shaper — vowel signs get a
 * zero advance and conjuncts never form. "Banana വാഴപ്പഴം" printed as
 * "Banana വഴപ്പഴം" on every bill whose product name starts in English.
 */
const fontDir = join(__dirname, '../../assets/fonts');
const REGULAR = join(fontDir, 'NotoSansMalayalam-Regular.ttf');
const BOLD = join(fontDir, 'NotoSansMalayalam-Bold.ttf');

const shapedDoc = () => {
  const doc = new PDFDocument({ size: 'A4' });
  doc.registerFont('NotoML', REGULAR);
  doc.registerFont('NotoML-Bold', BOLD);
  applyMalayalamShaping(doc, ['NotoML', 'NotoML-Bold']);
  return doc;
};

/** Glyph names pdfkit will actually draw, via the same path doc.text() uses. */
const glyphNames = (doc: any, text: string): string[] =>
  doc._font
    .layout(text, { abvm: false })
    .glyphs.map((g: any) => g.name as string);

describe('splitScriptRuns', () => {
  it('splits a Latin prefix from a Malayalam tail', () => {
    expect(splitScriptRuns('Banana വാഴപ്പഴം')).toEqual(['Banana ', 'വാഴപ്പഴം']);
  });

  it('splits on a boundary with no space', () => {
    expect(splitScriptRuns('Spinach/ചീര')).toEqual(['Spinach/', 'ചീര']);
  });

  it('leaves single-script text as one run', () => {
    expect(splitScriptRuns('വാഴപ്പഴം')).toEqual(['വാഴപ്പഴം']);
    expect(splitScriptRuns('Banana')).toEqual(['Banana']);
  });

  it('keeps a ZWJ chillu attached to its Malayalam run', () => {
    // ന + ് + ZWJ must stay in one run or the chillu falls apart.
    expect(splitScriptRuns('Rice അരിന്‍')).toEqual([
      'Rice ',
      'അരിന്‍',
    ]);
  });

  it('rejoins to the original string', () => {
    for (const s of ['Banana വാഴപ്പഴം', 'വാഴ (Banana) പഴം', '₹ 125.00 / ചീര']) {
      expect(splitScriptRuns(s).join('')).toBe(s);
    }
  });
});

describe('applyMalayalamShaping', () => {
  it('shapes Malayalam after a Latin prefix exactly as it shapes it alone', () => {
    const doc: any = shapedDoc();
    doc.font('NotoML-Bold');
    const alone = glyphNames(doc, 'വാഴപ്പഴം');
    const mixed = glyphNames(doc, 'Banana വാഴപ്പഴം');
    expect(mixed.slice(-alone.length)).toEqual(alone);
  });

  it('forms the പ്പ conjunct instead of leaving a bare virama', () => {
    const doc: any = shapedDoc();
    doc.font('NotoML');
    const mixed = glyphNames(doc, 'Banana വാഴപ്പഴം');
    expect(mixed).toContain('papamlym');
    expect(mixed).not.toContain('viramamlym');
  });

  it('gives vowel signs a real advance in mixed text', () => {
    const doc: any = shapedDoc();
    doc.font('NotoML');
    const widths = (t: string) => doc.widthOfString(t, { size: 10 });
    expect(widths('Banana വാഴപ്പഴം')).toBeCloseTo(
      widths('Banana ') + widths('വാഴപ്പഴം'),
      5,
    );
  });

  it('still disables abvm, so conjunct-heavy Malayalam does not crash', () => {
    const doc: any = shapedDoc();
    doc.font('NotoML');
    for (const name of ['കൊഴുപ്പ്', 'വെണ്ടയ്ക്ക', 'Okra വെണ്ടയ്ക്ക']) {
      expect(() => doc.text(name)).not.toThrow();
    }
  });
});
