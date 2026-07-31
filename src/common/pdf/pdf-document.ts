import { join } from 'path';
import * as PDFDocument from 'pdfkit';
import { applyMalayalamShaping } from '../../core/order/malayalam-shaping';

/**
 * Shared pdfkit bootstrap for every document the app produces.
 *
 * All text is set in Noto Sans Malayalam because product and customer names may
 * contain Malayalam. It also covers Latin and ₹, so amounts print the real
 * glyph rather than a fallback box. Any document that skips the shaping setup
 * either crashes on a conjunct or renders mis-shaped vowel signs — see
 * malayalam-shaping.ts for the two fontkit defects involved.
 *
 * Extracted from InvoiceService.render so the report exporter gets identical
 * font registration and shaping instead of a second, drifting copy.
 */

export const PDF_FONTS = ['NotoML', 'NotoML-Bold'] as const;

// Resolved from __dirname so the same relative path works under ts-jest
// (src/assets/fonts) and a built process (dist/assets/fonts). nest-cli copies
// these via the "assets" glob in nest-cli.json. src/common/pdf/ sits at the
// same depth below src/ as src/core/order/, so this matches InvoiceService's.
const FONT_DIR = join(__dirname, '../../assets/fonts');

export const PDF_FONT_FILES = {
  regular: join(FONT_DIR, 'NotoSansMalayalam-Regular.ttf'),
  bold: join(FONT_DIR, 'NotoSansMalayalam-Bold.ttf'),
};

/**
 * Runs a pdfkit document to completion and resolves the full Buffer.
 *
 * Buffering rather than streaming to the response: the buffer is reusable (the
 * order bill is both streamed to the admin and sent over WhatsApp from one
 * render), and a synchronous throw inside `build` still rejects the promise
 * instead of leaving a half-written response open.
 */
export function renderPdf(
  options: PDFKit.PDFDocumentOptions,
  build: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument(options);
      doc.registerFont('NotoML', PDF_FONT_FILES.regular);
      doc.registerFont('NotoML-Bold', PDF_FONT_FILES.bold);
      applyMalayalamShaping(doc, [...PDF_FONTS]);

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
