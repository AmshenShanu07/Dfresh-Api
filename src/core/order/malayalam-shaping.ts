/**
 * Two independent pdfkit/fontkit defects have to be worked around together to get
 * correct Malayalam out of a PDF. Fixing the first is what exposed the second.
 *
 * 1. fontkit@2.0.4 (latest published; no upgrade available) dereferences a null
 *    anchor while applying the `abvm` above-base-mark feature to Malayalam
 *    conjuncts, throwing "Cannot read properties of null (reading 'xCoordinate')".
 *    Disabling only `abvm` avoids it with no visual change — verified
 *    glyph-for-glyph against HarfBuzz over the full Malayalam repertoire.
 *    Disabling blwm/mark/mkmk/dist/kern does not help.
 *
 * 2. EmbeddedFont.layout() shapes the whole string as ONE run whenever `features`
 *    are passed; with no features it splits on whitespace and shapes word by word.
 *    Because (1) forces `features` onto every text call, that whitespace split is
 *    gone, and a mixed-script string is handed to fontkit whole. Script is then
 *    decided by the leading characters, so a Latin prefix makes the trailing
 *    Malayalam shape under the Latin shaper: vowel signs get a zero advance and
 *    collapse onto the next letter, and conjuncts never form. "Banana വാഴപ്പഴം"
 *    printed as "Banana വഴപ്പഴം"; pure-Malayalam names were unaffected, which is
 *    why this only showed up on products named in English first.
 *
 *    The fix is what a real text engine does: itemize into script runs and shape
 *    each separately. Doing it on the font (rather than at each doc.text call)
 *    means line wrapping and width measurement go through it too, since
 *    encode() and widthOfString() both route through layout().
 */

/** Malayalam block. Every Malayalam mark and vowel sign lives in here. */
const MALAYALAM = /[ഀ-ൿ]/;

/**
 * Zero-width joiners/format controls carry no script of their own. ZWJ in
 * particular forms chillu letters (ന + ് + ZWJ), so splitting on one would break
 * the cluster it exists to create — always keep them in the run in progress.
 */
const NEUTRAL = /[​-‏⁠﻿]/;

/**
 * Split text into maximal alternating runs of Malayalam / non-Malayalam.
 * Concatenating the result always reproduces the input exactly.
 */
export function splitScriptRuns(text: string): string[] {
  const runs: string[] = [];
  let current = '';
  let currentIsMalayalam: boolean | null = null;

  for (const ch of text) {
    if (NEUTRAL.test(ch)) {
      current += ch;
      continue;
    }
    const isMalayalam = MALAYALAM.test(ch);
    if (currentIsMalayalam === null || isMalayalam === currentIsMalayalam) {
      current += ch;
      currentIsMalayalam = isMalayalam;
    } else {
      runs.push(current);
      current = ch;
      currentIsMalayalam = isMalayalam;
    }
  }
  if (current) runs.push(current);
  return runs;
}

/** Disables only the crashing feature; everything else stays at font defaults. */
const ABVM_OFF = { abvm: false } as const;

/**
 * Wraps one EmbeddedFont so that any layout carrying `features` is shaped run by
 * run. Mirrors what pdfkit's own feature-less branch does when it concatenates
 * per-word runs, so glyphs, positions and advanceWidth stay in its units.
 */
function itemizeFont(font: any): void {
  if (font.__malayalamItemized) return;
  Object.defineProperty(font, '__malayalamItemized', { value: true });

  const origLayout = font.layout.bind(font);
  const layoutRun = font.layoutRun.bind(font);

  font.layout = (text: string, features?: any, onlyWidth?: boolean) => {
    // No features → pdfkit already splits on whitespace; leave it alone.
    if (!features) return origLayout(text, features, onlyWidth);

    const runs = splitScriptRuns(text);
    if (runs.length < 2) return origLayout(text, features, onlyWidth);

    let glyphs: any[] = [];
    let positions: any[] = [];
    let advanceWidth = 0;
    for (const run of runs) {
      const laid = layoutRun(run, features);
      advanceWidth += laid.advanceWidth;
      if (!onlyWidth) {
        glyphs = glyphs.concat(laid.glyphs);
        positions = positions.concat(laid.positions);
      }
    }
    return {
      glyphs: onlyWidth ? null : glyphs,
      positions: onlyWidth ? null : positions,
      advanceWidth,
    };
  };
}

/**
 * Hardens a document for Malayalam: forces ABVM_OFF onto every text call and
 * itemizes the named fonts by script.
 *
 * The features are forced here rather than at the ~28 call sites because a single
 * un-hardened call is a production crash. `fontNames` must already be registered;
 * each is selected once so pdfkit instantiates it (instances are cached per
 * document, so the wrap sticks). The originally selected font is restored.
 */
export function applyMalayalamShaping(
  doc: PDFKit.PDFDocument,
  fontNames: string[],
): PDFKit.PDFDocument {
  const orig = doc.text.bind(doc);
  // Spread order lets an explicit caller-supplied `features` win.
  const withFeatures = (o: any) => ({ features: ABVM_OFF, ...(o || {}) });

  (doc as any).text = (text: any, x?: any, y?: any, options?: any) => {
    if (x && typeof x === 'object') return orig(text, withFeatures(x));
    if (y && typeof y === 'object') return orig(text, x, withFeatures(y));
    // pdfkit's _initOptions is declared `(x = {}, y, options = {})` and then treats
    // an object `x` as the options bag, so text(t, undefined, undefined, opts)
    // defaults x to {} and throws opts away. Pass options positionally instead.
    if (x == null && y == null) return orig(text, withFeatures(options));
    return orig(text, x, y, withFeatures(options));
  };

  const previous = (doc as any)._fontSource;
  for (const name of fontNames) {
    doc.font(name);
    itemizeFont((doc as any)._font);
  }
  if (previous) (doc as any).font(previous);

  return doc;
}
