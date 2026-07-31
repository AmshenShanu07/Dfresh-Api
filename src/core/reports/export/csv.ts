/**
 * RFC 4180 CSV serialiser.
 *
 * Hand-rolled: the project has no CSV dependency, and pulling one in for ~40
 * lines of well-specified string handling isn't worth the supply-chain surface.
 *
 * Pure — no Nest, no I/O. The UTF-8 BOM is deliberately *not* added here (see
 * toCsvBuffer) so this function's output stays plain text and its spec doesn't
 * have to squint past an invisible character.
 */

/**
 * Fields that need quoting: the separator, a quote, either newline, or edge
 * whitespace. Leading/trailing spaces are quoted because several readers strip
 * them otherwise, which would silently alter an address or a product name.
 */
const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;

/**
 * Characters that make Excel/Sheets treat a field as a formula rather than
 * text. A cell beginning with one of these is executed on open, so a product
 * name entered as `=cmd|...` becomes a spreadsheet-injection vector.
 */
const FORMULA_LEAD = /^[=+@\t\r]/;

/** True for anything a spreadsheet would read as a plain number. */
function isNumeric(field: string): boolean {
  return field !== '' && Number.isFinite(Number(field));
}

/**
 * Escapes one field.
 *
 * The `-` case is the subtle one. A leading minus is a formula lead-in for
 * spreadsheet purposes, but guarding it unconditionally would turn every
 * negative number into text — and the wastage report's whole point is its
 * negative variance column, which must stay summable. So `-` is guarded only
 * when the field isn't a valid number: `-250` passes through, `-cmd` doesn't.
 */
function escapeField(value: string): string {
  let field = value;

  if (FORMULA_LEAD.test(field) || (field.startsWith('-') && !isNumeric(field))) {
    field = `'${field}`;
  }

  if (NEEDS_QUOTING.test(field)) {
    // A literal quote is escaped by doubling it, per RFC 4180.
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/** Null and undefined become an empty field; everything else is stringified. */
function normalise(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Serialises a header row plus body rows to CSV text.
 *
 * Rows are joined with CRLF: Excel is happiest with it and every other consumer
 * tolerates it. A trailing newline is emitted so the file ends cleanly.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeField(normalise(cell))).join(','),
  );
  return lines.join('\r\n') + '\r\n';
}

/**
 * The same CSV as a Buffer, prefixed with a UTF-8 BOM.
 *
 * U+FEFF is what forces Excel on Windows to read the file as UTF-8. Without it
 * a ₹ sign or a Malayalam product name renders as mojibake — the same charset
 * trap invoice.service.ts solves on the PDF side with a Unicode font.
 */
export function toCsvBuffer(headers: string[], rows: unknown[][]): Buffer {
  return Buffer.from('﻿' + toCsv(headers, rows), 'utf8');
}
