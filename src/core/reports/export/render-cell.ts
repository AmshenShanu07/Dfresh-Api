import { formatInTimeZone } from 'date-fns-tz';
import { IST_TZ } from 'src/common/utils/date-range';
import { ReportColumn } from '../report-types';

/**
 * Turns one row's cell into a display string.
 *
 * Both exporters go through this, so the CSV and the PDF can never disagree
 * about what a column contains — only about how it is decorated (see the money
 * note below).
 */
export function renderCell<TRow>(column: ReportColumn<TRow>, row: TRow): string {
  if (column.format) return column.format(row);

  const value = (row as any)[column.key];
  if (value === null || value === undefined) return '';

  switch (column.type) {
    /**
     * Money is a bare `1250.00` — deliberately NOT `₹1,250.00`.
     *
     * A currency-prefixed, comma-grouped string is *text* to Excel and cannot
     * be summed, which defeats the point of exporting a CSV. The PDF, which is
     * read rather than calculated on, adds the ₹ at layout time. This is the
     * one place the two formats intentionally differ.
     */
    case 'money':
      return (Number(value) || 0).toFixed(2);

    case 'percent':
      return `${(Number(value) || 0).toFixed(1)}%`;

    case 'number':
      return String(Number(value) || 0);

    // Dates render in IST for the same reason the ranges are IST-bounded: a
    // UTC-rendered timestamp would show an evening catalog order on the wrong
    // calendar day, contradicting the period it was selected into.
    case 'date':
      return formatInTimeZone(new Date(value), IST_TZ, 'dd-MM-yyyy');

    case 'datetime':
      return formatInTimeZone(new Date(value), IST_TZ, 'dd-MM-yyyy HH:mm');

    case 'bool':
      return value ? 'Yes' : 'No';

    default:
      return String(value);
  }
}

/** Renders a whole result set to the string matrix both exporters consume. */
export function renderRows<TRow>(
  columns: ReportColumn<TRow>[],
  rows: TRow[],
): string[][] {
  return rows.map((row) => columns.map((column) => renderCell(column, row)));
}

/** Human-readable period label for an export header. */
export function formatRangeLabel(from: Date, to: Date): string {
  // `to` is exclusive (start of the day after), so step back a day to name the
  // last day the range actually covers.
  const lastDay = new Date(to.getTime() - 1);
  const fromLabel = formatInTimeZone(from, IST_TZ, 'd MMM yyyy');
  const toLabel = formatInTimeZone(lastDay, IST_TZ, 'd MMM yyyy');
  return fromLabel === toLabel
    ? `${fromLabel} · IST`
    : `${fromLabel} – ${toLabel} · IST`;
}

/** Compact yyyyMMdd-yyyyMMdd stamp for export filenames. */
export function rangeStamp(from: Date, to: Date): string {
  const lastDay = new Date(to.getTime() - 1);
  return `${formatInTimeZone(from, IST_TZ, 'yyyyMMdd')}-${formatInTimeZone(
    lastDay,
    IST_TZ,
    'yyyyMMdd',
  )}`;
}
