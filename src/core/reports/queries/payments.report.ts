import { OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';
import { OrderDetails } from '../../order/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { deriveOrderNumber } from '../../order/order-number.util';
import { defineReport } from '../report-types';
import {
  MAX_REPORT_ROWS,
  applyOrderStatusFilter,
  applyOutletFilter,
} from '../reports.filters';

export interface PaymentsRow {
  orderId: string;
  orderNumber: string;
  date: Date;
  customer: string;
  phone: string;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  agent: string;
  /** True while an admin still has to act — UPI screenshot or verification. */
  needsAction: boolean;
  /** COD money that has been dispatched but not yet marked delivered. */
  outstandingCod: number;
}

const AWAITING: PaymentStatus[] = [
  PaymentStatus.AWAITING_SCREENSHOT,
  PaymentStatus.AWAITING_VERIFICATION,
];

export const paymentsReport = defineReport<PaymentsRow>({
  slug: 'payments',
  title: 'Payments & Collection',
  description:
    'Payment method and status per order, with the UPI verification backlog and outstanding COD.',
  filters: ['dateRange', 'status', 'paymentMethod', 'outlet'],
  periodScoped: true,

  columns: [
    { key: 'date', header: 'Date', type: 'datetime', width: 1.2 },
    { key: 'orderNumber', header: 'Order No', type: 'text', width: 1.3 },
    { key: 'customer', header: 'Customer', type: 'text', width: 1.5 },
    { key: 'total', header: 'Amount', type: 'money' },
    { key: 'paymentMethod', header: 'Method', type: 'text', width: 0.7 },
    { key: 'paymentStatus', header: 'Payment Status', type: 'text', width: 1.4 },
    { key: 'status', header: 'Order Status', type: 'status', width: 1.1 },
    { key: 'agent', header: 'Agent', type: 'text', width: 1.2 },
    { key: 'outstandingCod', header: 'Outstanding COD', type: 'money' },
    { key: 'phone', header: 'Phone', type: 'text', pdfHidden: true },
    { key: 'needsAction', header: 'Needs Action', type: 'bool', pdfHidden: true },
    { key: 'orderId', header: 'Order ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'codValue',
      label: 'COD Value',
      type: 'money',
      compute: (rows) =>
        rows
          .filter((r) => r.paymentMethod === PaymentMethod.COD)
          .reduce((sum, r) => sum + r.total, 0),
    },
    {
      key: 'upiValue',
      label: 'UPI Value',
      type: 'money',
      compute: (rows) =>
        rows
          .filter((r) => r.paymentMethod === PaymentMethod.UPI)
          .reduce((sum, r) => sum + r.total, 0),
    },
    {
      key: 'awaitingAction',
      label: 'Awaiting Verification',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.needsAction).length,
    },
    {
      key: 'outstandingCod',
      label: 'Outstanding COD',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.outstandingCod, 0),
    },
  ],

  /**
   * One row per order, focused on how the money is being collected.
   *
   * "Outstanding COD" means a COD order that has been DISPATCHED but not yet
   * DELIVERED — cash that is physically with a delivery agent. A CONFIRMED-but-
   * not-dispatched order is excluded because nobody is carrying that cash yet,
   * and a DELIVERED one is excluded because the agent has handed it over.
   * PaymentStatus is not used for this: COD orders sit at NOT_REQUIRED
   * throughout, so it carries no collection signal for them.
   *
   * `needsAction` covers only UPI: those are the orders where the customer has
   * been asked for a screenshot, or has sent one an admin has not yet verified.
   * OrderExpiryCronService deliberately exempts both states from auto-cancel,
   * so without this column they can sit indefinitely with nothing surfacing them.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .leftJoin(User, 'u', 'u.id = o.userId')
      .leftJoin(User, 'agent', 'agent.id = o.deliveryAgentId')
      .select('o.id', 'orderId')
      .addSelect('o.createdAt', 'createdAt')
      .addSelect('o.totalAmount', 'total')
      .addSelect('o.paymentMethod', 'paymentMethod')
      .addSelect('o.paymentStatus', 'paymentStatus')
      .addSelect('o.status', 'status')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect('agent.name', 'agent')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .orderBy('o.createdAt', 'DESC')
      .limit(MAX_REPORT_ROWS + 1);

    applyOrderStatusFilter(qb, 'o', ctx.filters.status);

    if (ctx.filters.paymentMethod) {
      qb.andWhere('o.paymentMethod = :reportPaymentMethod', {
        reportPaymentMethod: ctx.filters.paymentMethod,
      });
    }

    const outletMatchable = await applyOutletFilter(
      ctx.db,
      qb,
      'o',
      ctx.filters.outletId,
    );
    if (!outletMatchable) return [];

    const raw = await qb.getRawMany<{
      orderId: string;
      createdAt: Date;
      total: string;
      paymentMethod: PaymentMethod | null;
      paymentStatus: PaymentStatus;
      status: OrderStatus;
      customer: string | null;
      phone: string | null;
      agent: string | null;
    }>();

    return raw.map((r) => {
      const total = Number(r.total ?? 0);
      const isCod = r.paymentMethod === PaymentMethod.COD;
      return {
        orderId: r.orderId,
        orderNumber: deriveOrderNumber({
          id: r.orderId,
          createdAt: r.createdAt,
        }),
        date: r.createdAt,
        customer: r.customer ?? '—',
        phone: r.phone ?? '—',
        total,
        paymentMethod: r.paymentMethod,
        paymentStatus: r.paymentStatus,
        status: r.status,
        agent: r.agent ?? 'Unassigned',
        needsAction:
          r.paymentMethod === PaymentMethod.UPI &&
          AWAITING.includes(r.paymentStatus),
        outstandingCod:
          isCod && r.status === OrderStatus.DISPATCHED ? total : 0,
      };
    });
  },
});
