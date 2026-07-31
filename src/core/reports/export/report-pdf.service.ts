import { Injectable } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { renderPdf } from 'src/common/pdf/pdf-document';
import { IST_TZ } from 'src/common/utils/date-range';
import { ReportColumn } from '../report-types';

export interface ReportPdfInput {
  title: string;
  /** Period label, or null for a snapshot report that has no period. */
  rangeLabel: string | null;
  /** "Status: Confirmed, Delivered · Outlet: Kakkanad", or '' when unfiltered. */
  filterSummary: string;
  /** Already filtered to non-pdfHidden columns by the caller. */
  columns: ReportColumn<any>[];
  /** Already stringified by renderRows(). */
  rows: string[][];
  /**
   * Values arrive in the CSV's bare form ("520.00"); the type is carried so the
   * header strip gets decorated exactly like the table's money cells rather
   * than printing a naked number next to ₹-prefixed columns.
   */
  stats: { label: string; value: string; type: ReportColumn<any>['type'] }[];
  truncated: boolean;
}

/** Page geometry. Landscape A4 with a 36pt margin leaves ~770pt of table. */
const MARGIN = 36;
const HEADER_FILL = '#efe9e1';
const ZEBRA_FILL = '#f8f8f8';
const RULE_COLOR = '#cccccc';
const MUTED = '#666666';

/**
 * Renders any report definition to a printable PDF table.
 *
 * Pure in the same sense as InvoiceService: no repositories, no DB access, so
 * it can be provided anywhere without creating a dependency cycle. It receives
 * rows already stringified through renderCell, which is what guarantees the PDF
 * and the CSV never disagree about a value.
 *
 * What this adds over InvoiceService.generateBill, which is a fixed one-order
 * layout rather than a generic table:
 *  - landscape A4 and weighted column widths, so N columns fit legibly;
 *  - the header row is redrawn after every page break (the bill loses its
 *    header on page 2, which is tolerable for a 1-page receipt and not for a
 *    40-page register);
 *  - real per-cell heights via heightOfString, since any column may wrap.
 */
@Injectable()
export class ReportPdfService {
  async render(input: ReportPdfInput): Promise<Buffer> {
    return renderPdf(
      // bufferPages is required for the page-number pass: switchToPage can only
      // revisit an earlier page while pages are still buffered.
      { size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true },
      (doc) => {
        const left = doc.page.margins.left;
        const contentWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const bottomLimit = doc.page.height - doc.page.margins.bottom - 24;

        // Fewer columns can afford a larger face; past 8 the table needs 7pt to
        // stay on one page. Deterministic beats adapting per dataset — the same
        // report always prints at the same size.
        const fontSize = input.columns.length > 8 ? 7 : 8;
        const widths = this.columnWidths(input.columns, contentWidth);

        this.drawDocumentHeader(doc, input, left, contentWidth);

        let y = doc.y + 6;
        y = this.drawHeaderRow(doc, input.columns, widths, left, y, fontSize);

        if (input.rows.length === 0) {
          doc
            .font('NotoML')
            .fontSize(9)
            .fillColor(MUTED)
            .text('No data for this period.', left, y + 8, {
              width: contentWidth,
              align: 'center',
            })
            .fillColor('black');
        }

        input.rows.forEach((row, index) => {
          const heights = row.map((cell, i) =>
            doc
              .font('NotoML')
              .fontSize(fontSize)
              .heightOfString(cell || '', { width: widths[i] - 8 }),
          );
          const rowHeight = Math.max(...heights, 12) + 6;

          if (y + rowHeight > bottomLimit) {
            doc.addPage();
            y = doc.page.margins.top;
            y = this.drawHeaderRow(
              doc,
              input.columns,
              widths,
              left,
              y,
              fontSize,
            );
          }

          if (index % 2 === 1) {
            doc
              .rect(left, y - 2, contentWidth, rowHeight)
              .fill(ZEBRA_FILL)
              .fillColor('black');
          }

          let x = left;
          row.forEach((cell, i) => {
            doc
              .font('NotoML')
              .fontSize(fontSize)
              .fillColor('black')
              .text(this.decorate(cell, input.columns[i]), x + 4, y, {
                width: widths[i] - 8,
                align: this.alignFor(input.columns[i]),
              });
            x += widths[i];
          });

          y += rowHeight;
        });

        this.drawPageNumbers(doc);
      },
    );
  }

  /**
   * Money arrives from renderCell as a bare "1250.00" so the CSV stays
   * summable. The PDF is read rather than calculated on, so it gets the real
   * glyph and Indian digit grouping here — the one intentional divergence
   * between the two exports.
   */
  private decorate(cell: string, column: ReportColumn<any>): string {
    if (column.type !== 'money' || cell === '') return cell;
    const amount = Number(cell);
    if (!Number.isFinite(amount)) return cell;
    return `₹ ${amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private alignFor(column: ReportColumn<any>): 'left' | 'right' {
    return column.type === 'money' ||
      column.type === 'number' ||
      column.type === 'percent'
      ? 'right'
      : 'left';
  }

  /** Distributes the usable width across columns by their relative weights. */
  private columnWidths(
    columns: ReportColumn<any>[],
    contentWidth: number,
  ): number[] {
    const weights = columns.map((c) => c.width ?? 1);
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    return weights.map((w) => (w / total) * contentWidth);
  }

  private drawDocumentHeader(
    doc: PDFKit.PDFDocument,
    input: ReportPdfInput,
    left: number,
    contentWidth: number,
  ): void {
    doc.font('NotoML-Bold').fontSize(16).fillColor('black').text('DAILY FRESH');
    doc
      .font('NotoML-Bold')
      .fontSize(12)
      .text(input.title, { continued: false });

    doc.font('NotoML').fontSize(8).fillColor(MUTED);
    if (input.rangeLabel) {
      doc.text(`Period: ${input.rangeLabel}`);
    } else {
      // Snapshot reports describe stock *now*; labelling them with a period
      // would invite reading them as period-scoped.
      doc.text('Snapshot as of generation time');
    }
    if (input.filterSummary) doc.text(input.filterSummary);
    doc.text(
      `Generated ${formatInTimeZone(
        new Date(),
        IST_TZ,
        'dd-MM-yyyy HH:mm',
      )} IST`,
    );
    if (input.truncated) {
      doc
        .fillColor('#b00020')
        .text('Truncated — narrow the period to see every row.')
        .fillColor(MUTED);
    }
    doc.fillColor('black');

    if (input.stats.length) {
      doc.moveDown(0.4);
      const statLine = input.stats
        .map(
          (s) =>
            `${s.label}: ${this.decorate(s.value, { type: s.type } as ReportColumn<any>)}`,
        )
        .join('    ');
      doc.font('NotoML-Bold').fontSize(9).text(statLine, { width: contentWidth });
    }

    doc.moveDown(0.3);
    this.hr(doc, left, contentWidth, doc.y);
  }

  /** Draws the column header band and returns the y to start rows at. */
  private drawHeaderRow(
    doc: PDFKit.PDFDocument,
    columns: ReportColumn<any>[],
    widths: number[],
    left: number,
    y: number,
    fontSize: number,
  ): number {
    const heights = columns.map((c, i) =>
      doc
        .font('NotoML-Bold')
        .fontSize(fontSize)
        .heightOfString(c.header, { width: widths[i] - 8 }),
    );
    const rowHeight = Math.max(...heights, 12) + 6;
    const contentWidth = widths.reduce((sum, w) => sum + w, 0);

    doc
      .rect(left, y - 2, contentWidth, rowHeight)
      .fill(HEADER_FILL)
      .fillColor('black');

    let x = left;
    columns.forEach((column, i) => {
      doc
        .font('NotoML-Bold')
        .fontSize(fontSize)
        .fillColor('black')
        .text(column.header, x + 4, y, {
          width: widths[i] - 8,
          align: this.alignFor(column),
        });
      x += widths[i];
    });

    return y + rowHeight;
  }

  /**
   * Stamps "Page n of m" on every page. Done in one pass at the end because the
   * total page count isn't known until the table has been laid out.
   */
  private drawPageNumbers(doc: PDFKit.PDFDocument): void {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      doc
        .font('NotoML')
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          `Page ${i + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom - 12,
          {
            width:
              doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'right',
          },
        )
        .fillColor('black');
    }
  }

  private hr(
    doc: PDFKit.PDFDocument,
    x: number,
    width: number,
    y: number,
  ): void {
    doc
      .moveTo(x, y)
      .lineTo(x + width, y)
      .strokeColor(RULE_COLOR)
      .lineWidth(1)
      .stroke()
      .strokeColor('black');
  }
}
