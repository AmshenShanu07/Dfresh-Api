import { OrderStatus, PaymentMethod } from 'src/common/enums';
import { OrderDetails } from '../../order/entities/order.entity';
import { User } from '../../users/entities/user.entity';
import { Staff } from '../../users/entities/staff.entity';
import { Outlets } from '../../outlet/entities/outlet.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS, MONEY_STATUSES } from '../reports.filters';

export interface DeliveryAgentRow {
  agentId: string;
  agent: string;
  phone: string;
  outlet: string;
  assigned: number;
  delivered: number;
  dispatched: number;
  cancelled: number;
  deliveryRate: number;
  valueHandled: number;
  outstandingCod: number;
}

export const deliveryAgentsReport = defineReport<DeliveryAgentRow>({
  slug: 'delivery-agents',
  title: 'Delivery Agents',
  description:
    'Orders assigned, delivered and cancelled per delivery agent, with cash still in hand.',
  filters: ['dateRange', 'outlet'],
  periodScoped: true,

  columns: [
    { key: 'agent', header: 'Agent', type: 'text', width: 1.5 },
    { key: 'phone', header: 'Phone', type: 'text', width: 1.1 },
    { key: 'outlet', header: 'Outlet', type: 'text', width: 1.3 },
    { key: 'assigned', header: 'Assigned', type: 'number', width: 0.8 },
    { key: 'dispatched', header: 'Out', type: 'number', width: 0.7 },
    { key: 'delivered', header: 'Delivered', type: 'number', width: 0.8 },
    { key: 'deliveryRate', header: 'Delivered %', type: 'percent', width: 0.9 },
    { key: 'valueHandled', header: 'Value Handled', type: 'money' },
    { key: 'outstandingCod', header: 'Cash In Hand', type: 'money' },
    { key: 'cancelled', header: 'Cancelled', type: 'number', pdfHidden: true },
    { key: 'agentId', header: 'Agent ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'agents',
      label: 'Active Agents',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'delivered',
      label: 'Orders Delivered',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.delivered, 0),
    },
    {
      key: 'valueHandled',
      label: 'Value Handled',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.valueHandled, 0),
    },
    {
      key: 'cashInHand',
      label: 'Cash In Hand',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.outstandingCod, 0),
    },
  ],

  /**
   * One row per delivery agent with orders assigned in the period.
   *
   * The agent is a User with userType OUTLET_AGENT (DELIVERY_AGENT was merged
   * into that role), and their outlet comes through the Staff join — orders
   * themselves carry no outletId. The Staff join is LEFT and deduplicated by
   * grouping on the outlet name, so an agent attached to no outlet still
   * appears rather than silently vanishing from the report.
   *
   * "Cash in hand" is COD money on orders that are DISPATCHED but not yet
   * DELIVERED — the same definition the Payments report uses, so the two agree.
   *
   * No status filter is exposed: the point of the report is the ratio between
   * statuses, which a filter would collapse.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .innerJoin(User, 'a', 'a.id = o.deliveryAgentId')
      .leftJoin(Staff, 's', 's.userId = a.id AND s.isDeleted = false')
      .leftJoin(Outlets, 'out', 'out.id = s.outletId')
      .select('a.id', 'agentId')
      .addSelect('a.name', 'agent')
      .addSelect('a.phone', 'phone')
      .addSelect('out.name', 'outlet')
      .addSelect('COUNT(o.id)', 'assigned')
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :deliveredStatus)`,
        'delivered',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :dispatchedStatus)`,
        'dispatched',
      )
      .addSelect(
        `COUNT(o.id) FILTER (WHERE o.status = :cancelledStatus)`,
        'cancelled',
      )
      .addSelect(
        `COALESCE(SUM(o.totalAmount) FILTER (WHERE o.status IN (:...moneyStatuses)), 0)`,
        'valueHandled',
      )
      .addSelect(
        `COALESCE(SUM(o.totalAmount) FILTER (WHERE o.status = :dispatchedStatus AND o.paymentMethod = :cod), 0)`,
        'outstandingCod',
      )
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .setParameters({
        deliveredStatus: OrderStatus.DELIVERED,
        dispatchedStatus: OrderStatus.DISPATCHED,
        cancelledStatus: OrderStatus.CANCELLED,
        moneyStatuses: MONEY_STATUSES,
        cod: PaymentMethod.COD,
      })
      .groupBy('a.id')
      .addGroupBy('a.name')
      .addGroupBy('a.phone')
      .addGroupBy('out.name')
      .limit(MAX_REPORT_ROWS + 1);

    if (ctx.filters.outletId) {
      // Agents are tied to an outlet directly through Staff, so this needs no
      // ward derivation — unlike filtering orders by outlet.
      qb.andWhere('s.outletId = :agentOutletId', {
        agentOutletId: ctx.filters.outletId,
      });
    }

    const raw = await qb.getRawMany<{
      agentId: string;
      agent: string | null;
      phone: string | null;
      outlet: string | null;
      assigned: string;
      delivered: string;
      dispatched: string;
      cancelled: string;
      valueHandled: string;
      outstandingCod: string;
    }>();

    return raw
      .map((r) => {
        const assigned = Number(r.assigned ?? 0);
        const delivered = Number(r.delivered ?? 0);
        return {
          agentId: r.agentId,
          agent: r.agent ?? '—',
          phone: r.phone ?? '—',
          outlet: r.outlet ?? 'Unassigned',
          assigned,
          delivered,
          dispatched: Number(r.dispatched ?? 0),
          cancelled: Number(r.cancelled ?? 0),
          deliveryRate: assigned > 0 ? (delivered / assigned) * 100 : 0,
          valueHandled: Number(r.valueHandled ?? 0),
          outstandingCod: Number(r.outstandingCod ?? 0),
        };
      })
      .sort((a, b) => b.assigned - a.assigned);
  },
});
