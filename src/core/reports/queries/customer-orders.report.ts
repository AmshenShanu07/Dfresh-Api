import { OrderStatus, PaymentMethod, UserTypes } from 'src/common/enums';
import { OrderDetails } from '../../order/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { defineReport } from '../report-types';
import {
  MAX_REPORT_ROWS,
  MONEY_STATUSES,
  applyOutletFilter,
} from '../reports.filters';

export interface CustomerOrdersRow {
  userId: string;
  customer: string;
  phone: string;
  orders: number;
  totalSpent: number;
  aov: number;
  firstOrder: Date | null;
  lastOrder: Date | null;
  cancelled: number;
  cancellationRate: number;
  codOrders: number;
  upiOrders: number;
}

export const customerOrdersReport = defineReport<CustomerOrdersRow>({
  slug: 'customer-orders',
  title: 'Customer Orders',
  description:
    'Per customer: order count, spend, average order value and cancellation rate.',
  filters: ['dateRange', 'outlet'],
  periodScoped: true,

  columns: [
    { key: 'customer', header: 'Customer', type: 'text', width: 1.6 },
    { key: 'phone', header: 'Phone', type: 'text', width: 1.2 },
    { key: 'orders', header: 'Orders', type: 'number', width: 0.7 },
    { key: 'totalSpent', header: 'Total Spent', type: 'money' },
    { key: 'aov', header: 'Avg Order', type: 'money' },
    { key: 'cancelled', header: 'Cancelled', type: 'number', width: 0.8 },
    { key: 'cancellationRate', header: 'Cancel %', type: 'percent', width: 0.8 },
    { key: 'firstOrder', header: 'First Order', type: 'date' },
    { key: 'lastOrder', header: 'Last Order', type: 'date' },
    { key: 'codOrders', header: 'COD', type: 'number', pdfHidden: true },
    { key: 'upiOrders', header: 'UPI', type: 'number', pdfHidden: true },
    { key: 'userId', header: 'Customer ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'customers',
      label: 'Customers Who Ordered',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'revenue',
      label: 'Revenue',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.totalSpent, 0),
    },
    {
      key: 'avgSpend',
      label: 'Avg Spend / Customer',
      type: 'money',
      compute: (rows) =>
        rows.length
          ? rows.reduce((sum, r) => sum + r.totalSpent, 0) / rows.length
          : 0,
    },
    {
      key: 'repeatRate',
      label: 'Repeat Rate',
      type: 'percent',
      compute: (rows) =>
        rows.length
          ? (rows.filter((r) => r.orders > 1).length / rows.length) * 100
          : 0,
    },
  ],

  /**
   * One row per customer who ordered in the period.
   *
   * The status filter is deliberately NOT exposed here: the report needs both
   * the booked orders (for spend) and the cancelled ones (for the cancellation
   * rate) in a single pass, so a user-facing status filter would make the two
   * columns describe different populations. Money columns therefore always use
   * MONEY_STATUSES, and cancellations are counted separately via FILTER.
   *
   * FILTER (WHERE ...) is standard SQL and supported by Postgres; it keeps this
   * to one query rather than a booked query plus a cancelled query stitched in
   * TypeScript.
   *
   * Note on cancellations: OrderExpiryCronService auto-CANCELs unconfirmed
   * orders after 30 minutes and there is no cancellation-reason column, so a
   * high rate here mixes genuine customer cancellations with WhatsApp sessions
   * that simply timed out. It is a drop-off signal, not a complaint metric.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .innerJoin(User, 'u', 'u.id = o.userId')
      .select('o.userId', 'userId')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status IN (:...moneyStatuses))`,
        'orders',
      )
      .addSelect(
        `COALESCE(SUM(o.totalAmount) FILTER (WHERE o.status IN (:...moneyStatuses)), 0)`,
        'totalSpent',
      )
      .addSelect(
        `MIN(o.createdAt) FILTER (WHERE o.status IN (:...moneyStatuses))`,
        'firstOrder',
      )
      .addSelect(
        `MAX(o.createdAt) FILTER (WHERE o.status IN (:...moneyStatuses))`,
        'lastOrder',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :cancelledStatus)`,
        'cancelled',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.paymentMethod = :cod AND o.status IN (:...moneyStatuses))`,
        'codOrders',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.paymentMethod = :upi AND o.status IN (:...moneyStatuses))`,
        'upiOrders',
      )
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('u.userType = :customerType', {
        customerType: UserTypes.CUSTOMER,
      })
      // Exclude customers who only have DRAFT/PENDING rows in the period —
      // they belong in the abandoned-carts report, not the sales one.
      .andWhere(
        '(o.status IN (:...moneyStatuses) OR o.status = :cancelledStatus)',
      )
      .setParameters({
        moneyStatuses: MONEY_STATUSES,
        cancelledStatus: OrderStatus.CANCELLED,
        cod: PaymentMethod.COD,
        upi: PaymentMethod.UPI,
      })
      .groupBy('o.userId')
      .addGroupBy('u.name')
      .addGroupBy('u.phone')
      // Order by spend in SQL, not just in TS afterwards: the LIMIT decides
      // which rows survive truncation, so the biggest customers must be the
      // ones that are kept.
      .orderBy(
        `COALESCE(SUM(o.totalAmount) FILTER (WHERE o.status IN (:...moneyStatuses)), 0)`,
        'DESC',
      )
      .limit(MAX_REPORT_ROWS + 1);

    const outletMatchable = await applyOutletFilter(
      ctx.db,
      qb,
      'o',
      ctx.filters.outletId,
    );
    if (!outletMatchable) return [];

    const raw = await qb.getRawMany<{
      userId: string;
      customer: string | null;
      phone: string | null;
      orders: string;
      totalSpent: string;
      firstOrder: Date | null;
      lastOrder: Date | null;
      cancelled: string;
      codOrders: string;
      upiOrders: string;
    }>();

    return raw
      .map((r) => {
        const orders = Number(r.orders ?? 0);
        const cancelled = Number(r.cancelled ?? 0);
        const totalSpent = Number(r.totalSpent ?? 0);
        return {
          userId: r.userId,
          customer: r.customer ?? '—',
          phone: r.phone ?? '—',
          orders,
          totalSpent,
          aov: orders > 0 ? totalSpent / orders : 0,
          firstOrder: r.firstOrder,
          lastOrder: r.lastOrder,
          cancelled,
          // Denominator is every order they placed, booked plus cancelled —
          // cancelled/booked alone would exceed 100% for a customer who
          // cancelled more than they kept.
          cancellationRate:
            orders + cancelled > 0
              ? (cancelled / (orders + cancelled)) * 100
              : 0,
          codOrders: Number(r.codOrders ?? 0),
          upiOrders: Number(r.upiOrders ?? 0),
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);
  },
});
