import { OrderStatus } from 'src/common/enums';
import { Cart, CartItem } from '../../cart/entities/cart.entity';
import { OrderDetails, OrderItems } from '../../order/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS } from '../reports.filters';

export type AbandonedKind = 'Live cart' | 'Draft order' | 'Expired / cancelled';

export interface AbandonedCartRow {
  id: string;
  kind: AbandonedKind;
  customer: string;
  phone: string;
  items: number;
  value: number;
  lastActivity: Date | null;
  ageMinutes: number | null;
}

/** Minutes after which OrderExpiryCronService auto-cancels an unconfirmed order. */
const EXPIRY_MINUTES = 30;

function minutesSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
}

export const abandonedCartsReport = defineReport<AbandonedCartRow>({
  slug: 'abandoned-carts',
  title: 'Abandoned Carts',
  description:
    'Live carts and draft orders that never became sales, plus expired orders as a drop-off proxy.',
  filters: ['dateRange'],
  periodScoped: true,

  columns: [
    { key: 'kind', header: 'Type', type: 'text', width: 1.2 },
    { key: 'customer', header: 'Customer', type: 'text', width: 1.6 },
    { key: 'phone', header: 'Phone', type: 'text', width: 1.2 },
    { key: 'items', header: 'Items', type: 'number', width: 0.7 },
    { key: 'value', header: 'Value', type: 'money' },
    { key: 'lastActivity', header: 'Last Activity', type: 'datetime' },
    {
      key: 'ageMinutes',
      header: 'Age (min)',
      type: 'number',
      width: 0.9,
      format: (row) => (row.ageMinutes === null ? '—' : String(row.ageMinutes)),
    },
    { key: 'id', header: 'ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'liveCarts',
      label: 'Live Carts',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.kind === 'Live cart').length,
    },
    {
      key: 'draftOrders',
      label: 'Draft Orders',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.kind === 'Draft order').length,
    },
    {
      key: 'expired',
      label: 'Expired / Cancelled',
      type: 'number',
      compute: (rows) =>
        rows.filter((r) => r.kind === 'Expired / cancelled').length,
    },
    {
      key: 'lostValue',
      label: 'Value Not Converted',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.value, 0),
    },
  ],

  /**
   * Three disjoint populations, unioned in TypeScript because they live in
   * different tables with different time semantics. Each is labelled so nobody
   * reads them as one number.
   *
   * 1. LIVE CARTS — a Cart with items and no order yet. A snapshot: carts have
   *    no lifecycle, so the period does not apply to them. Freshness comes from
   *    MAX(CartItem.updatedAt), NOT Cart.updatedAt: CartService.addItem saves
   *    CartItem rows without ever touching the parent Cart, so the Cart's own
   *    @UpdateDateColumn only reflects when the cart was created.
   *
   * 2. DRAFT ORDERS — snapshot, and necessarily a narrow one:
   *    OrderExpiryCronService cancels DRAFT and PENDING orders after 30
   *    minutes, so nothing older than that can exist here.
   *
   * 3. EXPIRED / CANCELLED — period-scoped, and explicitly a PROXY. There is no
   *    cancellation-reason column, so an order auto-cancelled by the expiry
   *    cron is indistinguishable from one a customer or admin cancelled
   *    deliberately. Historical WhatsApp drop-off is not recoverable from this
   *    schema; treating this count as pure abandonment would overstate it.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const cartRows = await ctx.db
      .getRepository(Cart)
      .createQueryBuilder('c')
      .innerJoin(CartItem, 'ci', 'ci.cartId = c.id')
      .leftJoin(User, 'u', 'u.id = c.userId')
      .select('c.id', 'id')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(ci.id)', 'items')
      .addSelect('COALESCE(SUM(ci.price * ci.quantity), 0)', 'value')
      .addSelect('MAX(ci.updatedAt)', 'lastActivity')
      .groupBy('c.id')
      .addGroupBy('u.name')
      .addGroupBy('u.phone')
      .limit(MAX_REPORT_ROWS + 1)
      .getRawMany<{
        id: string;
        customer: string | null;
        phone: string | null;
        items: string;
        value: string;
        lastActivity: Date | null;
      }>();

    const orderRows = await ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .leftJoin(OrderItems, 'i', 'i.orderId = o.id')
      .leftJoin(User, 'u', 'u.id = o.userId')
      .select('o.id', 'id')
      .addSelect('o.status', 'status')
      .addSelect('o.createdAt', 'createdAt')
      .addSelect('o.totalAmount', 'value')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(i.id)', 'items')
      .where(
        // DRAFT is a snapshot of what is open right now; CANCELLED is
        // period-scoped. Combining them in one query keeps this to two round
        // trips rather than three.
        '(o.status = :draft OR (o.status = :cancelled AND o.createdAt >= :from AND o.createdAt < :to))',
        {
          draft: OrderStatus.DRAFT,
          cancelled: OrderStatus.CANCELLED,
          from,
          to,
        },
      )
      .groupBy('o.id')
      .addGroupBy('o.status')
      .addGroupBy('o.createdAt')
      .addGroupBy('o.totalAmount')
      .addGroupBy('u.name')
      .addGroupBy('u.phone')
      .orderBy('o.createdAt', 'DESC')
      .limit(MAX_REPORT_ROWS + 1)
      .getRawMany<{
        id: string;
        status: OrderStatus;
        createdAt: Date;
        value: string;
        customer: string | null;
        phone: string | null;
        items: string;
      }>();

    const carts: AbandonedCartRow[] = cartRows.map((r) => ({
      id: r.id,
      kind: 'Live cart' as const,
      customer: r.customer ?? '—',
      phone: r.phone ?? '—',
      items: Number(r.items ?? 0),
      value: Number(r.value ?? 0),
      lastActivity: r.lastActivity,
      ageMinutes: minutesSince(r.lastActivity),
    }));

    const orders: AbandonedCartRow[] = orderRows.map((r) => ({
      id: r.id,
      kind:
        r.status === OrderStatus.DRAFT
          ? ('Draft order' as const)
          : ('Expired / cancelled' as const),
      customer: r.customer ?? '—',
      phone: r.phone ?? '—',
      items: Number(r.items ?? 0),
      value: Number(r.value ?? 0),
      lastActivity: r.createdAt,
      ageMinutes: minutesSince(r.createdAt),
    }));

    return [...carts, ...orders].sort((a, b) => {
      const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bt - at;
    });
  },
});

/** Exported for the UI's explanatory note. */
export const ABANDONED_EXPIRY_MINUTES = EXPIRY_MINUTES;
