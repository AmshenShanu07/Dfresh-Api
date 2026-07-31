import { OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';
import { OrderDetails, OrderItems } from '../../order/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { deriveOrderNumber } from '../../order/order-number.util';
import { defineReport } from '../report-types';
import {
  MAX_REPORT_ROWS,
  applyOrderStatusFilter,
  applyOutletFilter,
} from '../reports.filters';

export interface SalesRow {
  orderId: string;
  orderNumber: string;
  date: Date;
  customer: string;
  phone: string;
  items: number;
  produce: number;
  cleaning: number;
  cutting: number;
  /** OrderDetails.totalAmount — what the customer was actually billed. */
  total: number;
  /** SUM(OrderItems.totalPrice) — should equal `total`; see the note on run(). */
  derivedTotal: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
}

export const salesReport = defineReport<SalesRow>({
  slug: 'sales',
  title: 'Sales Register',
  description:
    'Every order in the period, with its produce / cleaning / cutting split.',
  filters: ['dateRange', 'status', 'outlet', 'paymentMethod'],
  periodScoped: true,

  columns: [
    { key: 'date', header: 'Date', type: 'datetime', width: 1.2 },
    { key: 'orderNumber', header: 'Order No', type: 'text', width: 1.3 },
    { key: 'customer', header: 'Customer', type: 'text', width: 1.6 },
    { key: 'phone', header: 'Phone', type: 'text', width: 1.2, pdfHidden: true },
    { key: 'items', header: 'Items', type: 'number', width: 0.6 },
    { key: 'produce', header: 'Produce', type: 'money' },
    { key: 'cleaning', header: 'Cleaning', type: 'money' },
    { key: 'cutting', header: 'Cutting', type: 'money' },
    { key: 'total', header: 'Total', type: 'money' },
    { key: 'status', header: 'Status', type: 'status' },
    // Hidden from the PDF to keep the printed table at 9 columns; the Payments
    // report covers method/collection properly, and the CSV keeps the column.
    {
      key: 'paymentMethod',
      header: 'Payment',
      type: 'text',
      width: 0.8,
      pdfHidden: true,
    },
    // Diagnostic: only differs from `total` when an item row failed to write.
    {
      key: 'derivedTotal',
      header: 'Items Total',
      type: 'money',
      pdfHidden: true,
    },
    { key: 'orderId', header: 'Order ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'revenue',
      label: 'Revenue',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.total, 0),
    },
    {
      key: 'orders',
      label: 'Orders',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'aov',
      label: 'Avg Order Value',
      type: 'money',
      compute: (rows) =>
        rows.length ? rows.reduce((sum, r) => sum + r.total, 0) / rows.length : 0,
    },
    {
      key: 'items',
      label: 'Items Sold',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.items, 0),
    },
  ],

  /**
   * One row per order, with its line items folded in.
   *
   * REVENUE BASIS. Defaults to CONFIRMED + DISPATCHED + DELIVERED — *booked*
   * revenue, i.e. money the business has committed to but may not yet have
   * collected. This is deliberately wider than the dashboard's Revenue card
   * (DashboardService.getSummary), which counts DELIVERED only because a
   * headline "today's revenue" tile must be realised cash. The two are meant to
   * differ; the status filter lets an operator narrow this report to DELIVERED
   * and reconcile them exactly. See MONEY_STATUSES.
   *
   * FAN-OUT. The OrderItems join produces one SQL row per item, so every
   * OrderDetails column is repeated in GROUP BY rather than selected bare.
   * Writing `SUM(o.totalAmount)` here would multiply each order's total by its
   * item count — the single most likely bug in this file. Grouping on
   * o.totalAmount instead of aggregating it makes that multiplication
   * impossible to write by accident.
   *
   * LEFT JOIN, not inner. OrderService.createOrder skips an item whose variant
   * lookup fails (`if (!variant) return`) *after* it has already summed that
   * item into OrderDetails.totalAmount, so such an order has fewer OrderItems
   * than it was billed for. An inner join would hide a zero-item order
   * entirely; the left join keeps it visible and the `derivedTotal` column
   * makes the discrepancy legible instead of silent.
   *
   * CHARGES ARE PER UNIT. OrderItems stores cleaningCharge/cuttingCharge per
   * unit and multiplies at write time
   * (totalPrice = (price + cleaningCharge + cuttingCharge) * quantity), so each
   * split column must multiply by quantity to add back up to the total.
   * COALESCE guards the all-NULL case an order with no items produces.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .leftJoin(OrderItems, 'i', 'i.orderId = o.id')
      .leftJoin(User, 'u', 'u.id = o.userId')
      .select('o.id', 'orderId')
      .addSelect('o.createdAt', 'createdAt')
      .addSelect('o.totalAmount', 'total')
      .addSelect('o.status', 'status')
      .addSelect('o.paymentMethod', 'paymentMethod')
      .addSelect('o.paymentStatus', 'paymentStatus')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(i.id)', 'items')
      .addSelect('COALESCE(SUM(i.price * i.quantity), 0)', 'produce')
      .addSelect('COALESCE(SUM(i.cleaningCharge * i.quantity), 0)', 'cleaning')
      .addSelect('COALESCE(SUM(i.cuttingCharge * i.quantity), 0)', 'cutting')
      .addSelect('COALESCE(SUM(i.totalPrice), 0)', 'derivedTotal')
      // Half-open [from, to): `to` is the start of the day after the range, so
      // no 23:59:59.999 fudging and no order can fall into two periods.
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .groupBy('o.id')
      .addGroupBy('o.createdAt')
      .addGroupBy('o.totalAmount')
      .addGroupBy('o.status')
      .addGroupBy('o.paymentMethod')
      .addGroupBy('o.paymentStatus')
      .addGroupBy('u.name')
      .addGroupBy('u.phone')
      .orderBy('o.createdAt', 'DESC')
      // +1 so the service can detect truncation without a second COUNT.
      .limit(MAX_REPORT_ROWS + 1);

    applyOrderStatusFilter(qb, 'o', ctx.filters.status);

    if (ctx.filters.paymentMethod) {
      qb.andWhere('o.paymentMethod = :reportPaymentMethod', {
        reportPaymentMethod: ctx.filters.paymentMethod,
      });
    }

    // An outlet serving no ward can have no orders routed to it — an empty
    // result is the correct answer, not an unfiltered list.
    const outletMatchable = await applyOutletFilter(
      ctx.db,
      qb,
      'o',
      ctx.filters.outletId,
    );
    if (!outletMatchable) return [];

    // Postgres returns aggregates and numerics as strings over the wire.
    // Typing the raw shape as `string` and coercing exactly once here is what
    // stops "15000" + "15000" becoming "1500015000" downstream.
    const raw = await qb.getRawMany<{
      orderId: string;
      createdAt: Date;
      total: string;
      status: OrderStatus;
      paymentMethod: PaymentMethod | null;
      paymentStatus: PaymentStatus;
      customer: string | null;
      phone: string | null;
      items: string;
      produce: string;
      cleaning: string;
      cutting: string;
      derivedTotal: string;
    }>();

    return raw.map((r) => ({
      orderId: r.orderId,
      // The same derivation the printed bill, the item label and the WhatsApp
      // caption use, so a row here matches a physical receipt.
      orderNumber: deriveOrderNumber({ id: r.orderId, createdAt: r.createdAt }),
      date: r.createdAt,
      customer: r.customer ?? '—',
      phone: r.phone ?? '—',
      items: Number(r.items ?? 0),
      produce: Number(r.produce ?? 0),
      cleaning: Number(r.cleaning ?? 0),
      cutting: Number(r.cutting ?? 0),
      total: Number(r.total ?? 0),
      derivedTotal: Number(r.derivedTotal ?? 0),
      status: r.status,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
    }));
  },
});
