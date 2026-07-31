import { REPORTS } from './report-registry';
import { ReportDefinition, ReportFilterKey } from './report-types';

/**
 * Structural invariants across every report definition.
 *
 * Thirteen near-identical files get built by cloning one another, so the
 * failure mode is copy-paste: a duplicated slug, a column key that no longer
 * matches the row interface's sibling, two stats fighting over one key. These
 * are cheap to assert once and expensive to find by hand.
 */

const KNOWN_FILTER_KEYS: ReportFilterKey[] = [
  'dateRange',
  'status',
  'supplier',
  'category',
  'outlet',
  'ward',
  'agent',
  'paymentMethod',
  'product',
  'shareCatalog',
];

/** Landscape A4 at 7pt fits about this many columns before it stops being readable. */
const MAX_PDF_COLUMNS = 9;

const entries = Object.entries(REPORTS) as [string, ReportDefinition<any>][];

describe('report registry', () => {
  it('registers at least one report', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: key matches the definition slug', (key, definition) => {
    expect(definition.slug).toBe(key);
  });

  describe.each(entries)('%s', (_key, definition) => {
    it('has a title and a description', () => {
      expect(definition.title.trim()).not.toHaveLength(0);
      expect(definition.description.trim()).not.toHaveLength(0);
    });

    it('declares at least one column', () => {
      expect(definition.columns.length).toBeGreaterThan(0);
    });

    it('has unique column keys', () => {
      const keys = definition.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('gives every column a non-empty header', () => {
      for (const column of definition.columns) {
        expect(column.header.trim()).not.toHaveLength(0);
      }
    });

    it('has unique stat keys', () => {
      const keys = definition.stats.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('only declares known filter keys', () => {
      for (const filter of definition.filters) {
        expect(KNOWN_FILTER_KEYS).toContain(filter);
      }
    });

    it('has unique filter keys', () => {
      expect(new Set(definition.filters).size).toBe(definition.filters.length);
    });

    it('declares dateRange if and only if it is period-scoped', () => {
      // A period-scoped report without a date picker is unfilterable; a
      // snapshot report with one implies a period it does not actually honour.
      expect(definition.filters.includes('dateRange')).toBe(
        definition.periodScoped,
      );
    });

    it(`keeps the PDF to ${MAX_PDF_COLUMNS} columns or fewer`, () => {
      const visible = definition.columns.filter((c) => !c.pdfHidden);
      expect(visible.length).toBeLessThanOrEqual(MAX_PDF_COLUMNS);
    });

    it('exposes a runnable query', () => {
      expect(typeof definition.run).toBe('function');
    });
  });
});
