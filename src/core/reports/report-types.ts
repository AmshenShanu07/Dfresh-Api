import { DataSource } from 'typeorm';
import { OrderStatus, PaymentMethod } from 'src/common/enums';
import { DateRange, RangeKey } from 'src/common/utils/date-range';

/**
 * The report framework's keystone types.
 *
 * A report declares its columns exactly ONCE, here. The JSON table response,
 * the CSV export and the PDF export all derive from that single declaration, so
 * a column cannot be defined in three places and drift out of sync. Adding a
 * column to a definition makes it appear in all three outputs at once.
 */

/** Every report the registry knows about. */
export type ReportSlug =
  | 'sales'
  | 'purchase'
  | 'customer-orders'
  | 'stock-master'
  | 'stock-catalog'
  | 'catalog-performance'
  | 'product-performance'
  | 'payments'
  | 'wastage'
  | 'delivery-agents'
  | 'geography'
  | 'customer-acquisition'
  | 'abandoned-carts';

/**
 * Drives CSV/PDF string rendering on the backend AND the frontend's default
 * cell renderer, so a `money` column is right-aligned and rupee-formatted in
 * the table without the client registry restating anything.
 *
 *  - `amount` is a quantity in a product's base unit (g / ml / count) that has
 *    already been formatted to a display string by the query's `format`.
 */
export type ReportColumnType =
  | 'text'
  | 'number'
  | 'money'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'amount'
  | 'status'
  | 'bool';

export interface ReportColumn<TRow> {
  /** Stable id, and the field name this column reads off each row. */
  key: keyof TRow & string;
  header: string;
  type: ReportColumnType;
  /** Override when `type` alone can't render the cell (e.g. "1.5 kg"). */
  format?: (row: TRow) => string;
  /** Relative width weight for the PDF layout engine. Defaults to 1. */
  width?: number;
  /**
   * Drop this column from the PDF only. Landscape A4 fits ~9 columns legibly;
   * diagnostics and long identifiers are hidden there but kept in CSV/JSON.
   */
  pdfHidden?: boolean;
}

export interface ReportStat<TRow> {
  key: string;
  label: string;
  type: 'money' | 'number' | 'percent';
  /**
   * Computed over the FULL result set, never the current page — "total
   * revenue" that only covered the visible ten rows would be worse than
   * showing nothing.
   */
  compute: (rows: TRow[]) => number;
}

/** Filter controls a report can declare. Drives the UI and the backend alike. */
export type ReportFilterKey =
  | 'dateRange'
  | 'status'
  | 'supplier'
  | 'category'
  | 'outlet'
  | 'ward'
  | 'agent'
  | 'paymentMethod'
  | 'product'
  | 'shareCatalog';

/** The narrowed filter bag a report's `run` receives. */
export interface ReportFilters {
  status?: OrderStatus[];
  supplierId?: string;
  categoryId?: string;
  productId?: string;
  wardId?: string;
  deliveryAgentId?: string;
  shareCatalogId?: string;
  paymentMethod?: PaymentMethod;
  outletId?: string;
}

export interface ReportContext {
  /**
   * A DataSource rather than injected repositories: with 13 query files each
   * touching a different handful of entities, constructor injection would mean
   * ~15 repositories on ReportsService that most queries never use. Query files
   * call ctx.db.getRepository(X).createQueryBuilder(...), which is the same
   * builder object DashboardService works with.
   */
  db: DataSource;
  /** Always resolved, even for snapshot reports that ignore it. */
  range: DateRange;
  /** Already narrowed to the keys this report declared in `filters`. */
  filters: ReportFilters;
}

export interface ReportDefinition<TRow = any> {
  slug: ReportSlug;
  title: string;
  description: string;
  /**
   * Which controls the UI renders AND which filters the backend honours — one
   * array serving both ends means the two can never disagree about what a
   * report supports.
   */
  filters: ReportFilterKey[];
  /**
   * False for snapshot reports (stock-master describes stock *now*, not stock
   * during a period). The UI hides the date picker and the PDF header omits the
   * range line, so a snapshot is never mislabelled as period-scoped.
   */
  periodScoped: boolean;
  columns: ReportColumn<TRow>[];
  stats: ReportStat<TRow>[];
  /**
   * Returns EVERY matching row, unpaginated — the service slices a page from
   * it. See ReportsService for why paging happens in memory.
   */
  run(ctx: ReportContext): Promise<TRow[]>;
}

/**
 * Identity function whose only job is to pin TRow so `columns[].key` is checked
 * against the row interface and `stats[].compute` gets a typed array. Written
 * as `defineReport<SalesRow>({...})` at each definition site.
 */
export const defineReport = <TRow>(
  definition: ReportDefinition<TRow>,
): ReportDefinition<TRow> => definition;

/** Column metadata as sent to the client — the functions are stripped. */
export interface ReportColumnMeta {
  key: string;
  header: string;
  type: ReportColumnType;
}

export interface ReportRangeMeta {
  key: RangeKey | 'custom';
  from: Date;
  to: Date;
}
