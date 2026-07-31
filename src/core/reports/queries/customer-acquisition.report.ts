import { UserTypes } from 'src/common/enums';
import { OrderDetails } from '../../order/entities/order.entity';
import { User, UserAddress } from '../../users/entities/user.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS, MONEY_STATUSES } from '../reports.filters';

export interface CustomerAcquisitionRow {
  userId: string;
  customer: string;
  phone: string;
  signedUpAt: Date;
  firstOrderAt: Date | null;
  /** Whole days between signup and first order; null if they never ordered. */
  daysToFirstOrder: number | null;
  orders: number;
  totalSpent: number;
  hasAddress: boolean;
  converted: boolean;
}

export const customerAcquisitionReport = defineReport<CustomerAcquisitionRow>({
  slug: 'customer-acquisition',
  title: 'Customer Acquisition',
  description:
    'Customers who signed up in the period, and whether they went on to order.',
  filters: ['dateRange'],
  periodScoped: true,

  columns: [
    { key: 'customer', header: 'Customer', type: 'text', width: 1.6 },
    { key: 'phone', header: 'Phone', type: 'text', width: 1.2 },
    { key: 'signedUpAt', header: 'Signed Up', type: 'date' },
    { key: 'firstOrderAt', header: 'First Order', type: 'date' },
    {
      key: 'daysToFirstOrder',
      header: 'Days To Convert',
      type: 'number',
      width: 1,
      format: (row) =>
        row.daysToFirstOrder === null ? '—' : String(row.daysToFirstOrder),
    },
    { key: 'orders', header: 'Orders', type: 'number', width: 0.7 },
    { key: 'totalSpent', header: 'Total Spent', type: 'money' },
    { key: 'hasAddress', header: 'Has Address', type: 'bool', width: 0.9 },
    { key: 'converted', header: 'Ordered', type: 'bool', width: 0.7 },
    { key: 'userId', header: 'Customer ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'signups',
      label: 'Signups',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'converted',
      label: 'Placed An Order',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.converted).length,
    },
    {
      key: 'conversionRate',
      label: 'Conversion Rate',
      type: 'percent',
      compute: (rows) =>
        rows.length
          ? (rows.filter((r) => r.converted).length / rows.length) * 100
          : 0,
    },
    {
      key: 'avgDaysToConvert',
      label: 'Avg Days To Convert',
      type: 'number',
      compute: (rows) => {
        const converted = rows.filter((r) => r.daysToFirstOrder !== null);
        return converted.length
          ? converted.reduce((sum, r) => sum + (r.daysToFirstOrder ?? 0), 0) /
              converted.length
          : 0;
      },
    },
  ],

  /**
   * One row per CUSTOMER who signed up inside the period.
   *
   * The period scopes the SIGNUP, not the orders: a customer who registered in
   * the window and first ordered a month later still counts as converted, which
   * is the only way the days-to-convert figure means anything. That does mean
   * conversion for a very recent window will look low simply because those
   * customers have not had time yet — inherent to cohort reporting rather than
   * a defect.
   *
   * `hasAddress` is a real funnel step here: the WhatsApp flow blocks checkout
   * until an address exists, so a cohort with signups but no addresses points
   * at drop-off during ward/area selection rather than at pricing.
   *
   * Order aggregates are LEFT joined and restricted to booked statuses, so an
   * abandoned DRAFT never counts as a conversion.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(User)
      .createQueryBuilder('u')
      .leftJoin(
        OrderDetails,
        'o',
        'o."userId" = u.id AND o.status IN (:...moneyStatuses)',
      )
      .leftJoin(UserAddress, 'addr', 'addr."userId" = u.id')
      .select('u.id', 'userId')
      .addSelect('u.name', 'customer')
      .addSelect('u.phone', 'phone')
      .addSelect('u.createdAt', 'signedUpAt')
      .addSelect('MIN(o.createdAt)', 'firstOrderAt')
      .addSelect('COUNT(DISTINCT o.id)', 'orders')
      .addSelect('COALESCE(SUM(o."totalAmount"), 0)', 'totalSpent')
      .addSelect('COUNT(DISTINCT addr.id)', 'addresses')
      .where('u.userType = :customerType', {
        customerType: UserTypes.CUSTOMER,
      })
      .andWhere('u.createdAt >= :from AND u.createdAt < :to', { from, to })
      .setParameters({ moneyStatuses: MONEY_STATUSES })
      .groupBy('u.id')
      .addGroupBy('u.name')
      .addGroupBy('u.phone')
      .addGroupBy('u.createdAt')
      .orderBy('u.createdAt', 'DESC')
      .limit(MAX_REPORT_ROWS + 1);

    const raw = await qb.getRawMany<{
      userId: string;
      customer: string | null;
      phone: string | null;
      signedUpAt: Date;
      firstOrderAt: Date | null;
      orders: string;
      totalSpent: string;
      addresses: string;
    }>();

    return raw.map((r) => {
      const orders = Number(r.orders ?? 0);
      const firstOrderAt = r.firstOrderAt;

      return {
        userId: r.userId,
        customer: r.customer ?? '—',
        phone: r.phone ?? '—',
        signedUpAt: r.signedUpAt,
        firstOrderAt,
        daysToFirstOrder: firstOrderAt
          ? Math.max(
              0,
              Math.floor(
                (new Date(firstOrderAt).getTime() -
                  new Date(r.signedUpAt).getTime()) /
                  86_400_000,
              ),
            )
          : null,
        orders,
        totalSpent: Number(r.totalSpent ?? 0),
        hasAddress: Number(r.addresses ?? 0) > 0,
        converted: orders > 0,
      };
    });
  },
});
