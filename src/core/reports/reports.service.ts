import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { resolveReportRange } from 'src/common/utils/date-range';
import { positiveIntOr } from 'src/common/utils/pagination';
import { getReportDefinition, listReportDefinitions } from './report-registry';
import { pickFilters, MAX_REPORT_ROWS } from './reports.filters';
import { ReportQueryDto } from './dto/report-query.dto';
import {
  ReportColumn,
  ReportDefinition,
  ReportFilters,
} from './report-types';
import { toCsvBuffer } from './export/csv';
import {
  formatRangeLabel,
  rangeStamp,
  renderCell,
  renderRows,
} from './export/render-cell';
import { ReportPdfService } from './export/report-pdf.service';

const DEFAULT_PAGE_SIZE = 25;

/** Everything a resolved report run produces, before it is shaped per-format. */
interface ResolvedReport {
  definition: ReportDefinition<any>;
  range: ReturnType<typeof resolveReportRange>;
  filters: ReportFilters;
  rows: any[];
  stats: Record<string, number>;
  truncated: boolean;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly pdfService: ReportPdfService,
  ) {}

  listReports() {
    return listReportDefinitions();
  }

  /**
   * Runs a report to completion.
   *
   * `run()` returns every matching row and the page is sliced here rather than
   * in SQL. That is deliberate: the stat strip must aggregate the *whole*
   * result (a "Total revenue" card showing only the visible ten rows would be
   * worse than no card), and the export must not be page-limited. Getting all
   * three outputs from one query keeps each report to a single method instead
   * of a `run({limit, offset})` plus a parallel `summary()` that could drift.
   *
   * The cost — unbounded memory on a wide range — is capped by MAX_REPORT_ROWS.
   */
  private async resolve(
    slug: string,
    query: ReportQueryDto,
  ): Promise<ResolvedReport> {
    const definition = getReportDefinition(slug);
    if (!definition) {
      throw new NotFoundException(`Unknown report "${slug}"`);
    }

    const range = resolveReportRange(query);
    const filters = pickFilters(definition, query);

    const all = await definition.run({
      db: this.dataSource,
      range: { from: range.from, to: range.to },
      filters,
    });

    // Queries select MAX_REPORT_ROWS + 1; the extra row is the truncation
    // signal, so no second COUNT is needed to detect it.
    const truncated = all.length > MAX_REPORT_ROWS;
    const rows = truncated ? all.slice(0, MAX_REPORT_ROWS) : all;

    const stats = Object.fromEntries(
      definition.stats.map((stat) => [stat.key, stat.compute(rows)]),
    );

    return { definition, range, filters, rows, stats, truncated };
  }

  /** JSON payload for the table: one page of rows plus whole-set metadata. */
  async getReport(slug: string, query: ReportQueryDto) {
    const { definition, range, rows, stats, truncated } = await this.resolve(
      slug,
      query,
    );

    const pageSize = positiveIntOr(query.count, DEFAULT_PAGE_SIZE);
    const pageNumber = positiveIntOr(query.pageNumber, 1);
    const start = (pageNumber - 1) * pageSize;

    return {
      slug: definition.slug,
      title: definition.title,
      description: definition.description,
      filters: definition.filters,
      periodScoped: definition.periodScoped,
      range: { key: range.key, from: range.from, to: range.to },
      columns: this.columnMeta(definition.columns),
      stats,
      total: rows.length,
      truncated,
      data: rows.slice(start, start + pageSize),
    };
  }

  /** CSV or PDF over the FULL result set — never the current page. */
  async exportReport(
    slug: string,
    query: ReportQueryDto & { format: 'csv' | 'pdf' },
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const { definition, range, filters, rows, stats, truncated } =
      await this.resolve(slug, query);

    const stamp = rangeStamp(range.from, range.to);
    const filenameBase = `dfresh-${definition.slug}-${stamp}`;

    if (query.format === 'csv') {
      const headers = definition.columns.map((c) => c.header);
      const body = renderRows(definition.columns, rows);
      return {
        buffer: toCsvBuffer(headers, body),
        filename: `${filenameBase}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    // The PDF drops pdfHidden columns so a wide table stays legible on
    // landscape A4; the CSV above keeps every column.
    const pdfColumns = definition.columns.filter((c) => !c.pdfHidden);
    const buffer = await this.pdfService.render({
      title: definition.title,
      rangeLabel: definition.periodScoped
        ? formatRangeLabel(range.from, range.to)
        : null,
      filterSummary: this.describeFilters(filters),
      columns: pdfColumns,
      rows: renderRows(pdfColumns, rows),
      stats: definition.stats.map((stat) => ({
        label: stat.label,
        type: stat.type,
        value: renderCell(
          { key: stat.key as never, header: stat.label, type: stat.type },
          stats,
        ),
      })),
      truncated,
    });

    return {
      buffer,
      filename: `${filenameBase}.pdf`,
      contentType: 'application/pdf',
    };
  }

  /** Strips the render functions — only serialisable metadata reaches the client. */
  private columnMeta(columns: ReportColumn<any>[]) {
    return columns.map(({ key, header, type }) => ({ key, header, type }));
  }

  /** Human-readable filter line for the PDF header. Empty when unfiltered. */
  private describeFilters(filters: ReportFilters): string {
    const parts: string[] = [];
    if (filters.status?.length) parts.push(`Status: ${filters.status.join(', ')}`);
    if (filters.paymentMethod) parts.push(`Payment: ${filters.paymentMethod}`);
    // Ids rather than names: resolving every filter to a display name would put
    // a handful of extra lookups on the export path for one line of header text.
    if (filters.outletId) parts.push(`Outlet: ${filters.outletId}`);
    if (filters.supplierId) parts.push(`Supplier: ${filters.supplierId}`);
    if (filters.categoryId) parts.push(`Category: ${filters.categoryId}`);
    if (filters.wardId) parts.push(`Ward: ${filters.wardId}`);
    if (filters.productId) parts.push(`Product: ${filters.productId}`);
    if (filters.deliveryAgentId) parts.push(`Agent: ${filters.deliveryAgentId}`);
    if (filters.shareCatalogId) parts.push(`Catalog: ${filters.shareCatalogId}`);
    return parts.join(' · ');
  }
}
