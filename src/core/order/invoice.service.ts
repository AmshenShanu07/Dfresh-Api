import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';
import * as PDFDocument from 'pdfkit';
import { MeasurementType } from 'src/common/enums';
import { formatAmount } from 'src/common/utils/units';
import { deriveOrderNumber } from './order-number.util';

/**
 * Builds printable PDFs from a fully-hydrated order (as returned by
 * OrderService.findOne — user, deliveryDetails, orderItems.product/variant).
 *
 * Pure: no DB access, no injected repositories, so it has no circular
 * dependency on OrderService and can be provided to any module that needs it.
 *
 * Amounts are rendered as "Rs." rather than the ₹ glyph: pdfkit's built-in
 * Helvetica font has no rupee glyph, so ₹ would print as a blank box.
 */
@Injectable()
export class InvoiceService {
  private readonly storeName = 'D-FRESH';
  private readonly tagline = 'Fresh Produce Delivery';
  private readonly contactPhone = '+91 98765 43210';
  private readonly address = 'Kochi, Kerala, India';

  /** A4 customer bill covering the whole order. */
  async generateBill(order: any): Promise<Buffer> {
    return this.render({ size: 'A4', margin: 50 }, (doc) => {
      const orderNo = deriveOrderNumber(order);
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      // ---- Header ----
      doc.font('Helvetica-Bold').fontSize(22).text(this.storeName, { align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(`${this.tagline} • ${this.address}`, { align: 'center' })
        .text(`Mob: ${this.contactPhone}`, { align: 'center' });
      doc.moveDown(0.8);
      this.hr(doc, left, pageWidth);
      doc.moveDown(0.6);

      // ---- Bill meta + customer ----
      const d = order.deliveryDetails;
      const customerName = d?.name || order.user?.name || 'Customer';
      const customerPhone = d?.phone || order.user?.phone || '';
      const metaTop = doc.y;

      doc.font('Helvetica-Bold').fontSize(10).text('Bill To:', left, metaTop);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(customerName)
        .text(d?.address ? `${d.address}${d.pinCode ? ', ' + d.pinCode : ''}` : '')
        .text(customerPhone ? `Phone: ${customerPhone}` : '');

      const rightX = left + pageWidth / 2;
      doc.font('Helvetica').fontSize(10);
      doc.text(`Order No: ${orderNo}`, rightX, metaTop, { align: 'right', width: pageWidth / 2 });
      doc.text(`Date: ${format(new Date(order.createdAt), 'dd-MM-yyyy HH:mm')}`, rightX, doc.y, { align: 'right', width: pageWidth / 2 });
      doc.text(`Payment: ${order.paymentMethod || 'N/A'}`, rightX, doc.y, { align: 'right', width: pageWidth / 2 });
      doc.text(`Status: ${order.status}`, rightX, doc.y, { align: 'right', width: pageWidth / 2 });

      doc.moveDown(1);
      let y = Math.max(doc.y, metaTop + 70);

      // ---- Items table ----
      const cols = {
        item: left,
        qty: left + pageWidth * 0.52,
        unit: left + pageWidth * 0.64,
        addon: left + pageWidth * 0.76,
        amount: left + pageWidth * 0.88,
      };
      const amountWidth = left + pageWidth - cols.amount;

      this.hr(doc, left, pageWidth, y);
      y += 6;
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Item', cols.item, y, { width: cols.qty - cols.item - 4 });
      doc.text('Qty', cols.qty, y, { width: cols.unit - cols.qty - 4 });
      doc.text('Unit', cols.unit, y, { width: cols.addon - cols.unit - 4 });
      doc.text('Add-ons', cols.addon, y, { width: cols.amount - cols.addon - 4 });
      doc.text('Amount', cols.amount, y, { width: amountWidth, align: 'right' });
      y += 16;
      this.hr(doc, left, pageWidth, y);
      y += 6;

      doc.font('Helvetica').fontSize(9);
      for (const item of order.orderItems || []) {
        const nameCellW = cols.qty - cols.item - 4;
        const name = item.product?.name || 'Item';
        const weightLine = this.perUnitWeight(item);
        const addons = this.addonsText(item) || '—';

        const startY = y;
        doc.font('Helvetica-Bold').fontSize(9).text(name, cols.item, y, { width: nameCellW });
        if (weightLine) {
          doc.font('Helvetica').fontSize(8).fillColor('#555').text(weightLine, cols.item, doc.y, { width: nameCellW });
          doc.fillColor('black');
        }
        const nameEndY = doc.y;

        doc.font('Helvetica').fontSize(9);
        doc.text(this.formatQty(item), cols.qty, startY, { width: cols.unit - cols.qty - 4 });
        doc.text(this.money(item.price), cols.unit, startY, { width: cols.addon - cols.unit - 4 });
        doc.fontSize(9).text(this.money(item.totalPrice), cols.amount, startY, { width: amountWidth, align: 'right' });
        // Add-ons can wrap to several lines — render last and measure its bottom
        // so the row height covers the tallest cell and rows never overlap.
        doc.fontSize(8).text(addons, cols.addon, startY, { width: cols.amount - cols.addon - 4 });
        const addonEndY = doc.y;

        y = Math.max(nameEndY, addonEndY, startY + 14) + 6;

        if (y > doc.page.height - 120) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      }

      this.hr(doc, left, pageWidth, y);
      y += 10;

      // ---- Total ----
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('Grand Total', cols.item, y, { width: cols.amount - cols.item - 4 });
      doc.text(this.money(order.totalAmount), cols.amount, y, { width: amountWidth, align: 'right' });

      doc.moveDown(3);
      doc.font('Helvetica').fontSize(9).fillColor('#666')
        .text('Thank you for shopping with D-Fresh!', left, doc.y, { align: 'center', width: pageWidth });
      doc.fillColor('black');
    });
  }

  /** Compact per-line-item label (~80mm x 100mm) stuck onto the product. */
  async generateLabel(item: any, order: any): Promise<Buffer> {
    // 80mm x 100mm in PDF points (1mm ≈ 2.8346pt).
    const width = 227;
    const height = 283;
    return this.render({ size: [width, height], margin: 12 }, (doc) => {
      const orderNo = deriveOrderNumber(order);
      const contentW =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      doc.font('Helvetica-Bold').fontSize(16).text(this.storeName, { align: 'center' });
      doc.moveDown(0.3);
      this.hr(doc, left, contentW);
      doc.moveDown(0.5);

      const field = (label: string, value: string) => {
        doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, { continued: true });
        doc.font('Helvetica').fontSize(9).text(value || '—');
      };

      field('ITEM', item.product?.name || 'Item');
      field('PREP', this.prepText(item));

      const gross = this.grossWeight(item);
      if (gross) field('GROSS', gross);
      const net = this.netWeight(item);
      if (net) field('NET', net);

      field('QTY', this.formatQty(item));
      field('PRICE', `${this.money(item.price)} / unit`);
      field('TOTAL', this.money(item.totalPrice));
      field('PACKED', format(new Date(), 'dd-MM-yyyy HH:mm'));

      doc.moveDown(0.5);
      this.hr(doc, left, contentW);
      doc.moveDown(0.5);

      field('CUSTOMER', order.deliveryDetails?.name || order.user?.name || 'Customer');
      field('ORDER NO', orderNo);
    });
  }

  // ---- helpers ----

  /** Runs a pdfkit document to completion and resolves the full Buffer. */
  private render(
    options: PDFKit.PDFDocumentOptions,
    build: (doc: PDFKit.PDFDocument) => void,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument(options);
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

  private hr(doc: PDFKit.PDFDocument, x: number, width: number, y?: number) {
    const lineY = y ?? doc.y;
    doc
      .moveTo(x, lineY)
      .lineTo(x + width, lineY)
      .strokeColor('#cccccc')
      .lineWidth(1)
      .stroke()
      .strokeColor('black');
  }

  private money(n: number): string {
    return `Rs. ${(Number(n) || 0).toFixed(2)}`;
  }

  private measurementType(item: any): MeasurementType {
    return item.product?.measurementType ?? MeasurementType.WEIGHT;
  }

  /** Quantity as shown in a Qty column, e.g. "2" or "1.5". */
  private formatQty(item: any): string {
    const q = Number(item.quantity) || 0;
    return Number.isInteger(q) ? String(q) : String(q);
  }

  /** Per-unit variant size, e.g. "500 g" (blank when the item has no variant). */
  private perUnitWeight(item: any): string {
    if (!item.variant) return '';
    return formatAmount(Number(item.variant.weight) || 0, this.measurementType(item));
  }

  /** Total ordered size across the quantity, e.g. "2 kg" for 4 x 500 g. */
  private grossWeight(item: any): string {
    if (!item.variant) return '';
    const base = (Number(item.variant.weight) || 0) * (Number(item.quantity) || 0);
    return formatAmount(base, this.measurementType(item));
  }

  /** Admin-recorded weight after cleaning, in the unit the admin entered. */
  private netWeight(item: any): string {
    if (item.cleanedWeight == null) return '';
    return `${item.cleanedWeight} ${item.cleanedWeightUnit || ''}`.trim();
  }

  private addonsText(item: any): string {
    const parts: string[] = [];
    if (item.cleaning) parts.push(`Cleaning ${this.money(item.cleaningCharge)}`);
    if (item.cutting) {
      const label = item.cuttingOption ? `Cut: ${item.cuttingOption}` : 'Cut';
      parts.push(`${label} ${this.money(item.cuttingCharge)}`);
    }
    return parts.join(', ');
  }

  /** Preparation summary for the label, e.g. "Curry Cut (Cleaned)". */
  private prepText(item: any): string {
    const cut = item.cutting && item.cuttingOption ? item.cuttingOption : '';
    if (cut && item.cleaning) return `${cut} (Cleaned)`;
    if (cut) return cut;
    if (item.cleaning) return 'Cleaned';
    return '—';
  }
}
