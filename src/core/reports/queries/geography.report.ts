import { OrderDetails } from '../../order/entities/order.entity';
import { Ward } from '../../ward/entities/ward.entity';
import { Area } from '../../area/entities/area.entity';
import { Outlets } from '../../outlet/entities/outlet.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS, MONEY_STATUSES } from '../reports.filters';

export interface GeographyRow {
  wardId: string | null;
  ward: string;
  localBody: string;
  district: string;
  area: string;
  orders: number;
  revenue: number;
  customers: number;
  aov: number;
  /** Wards with customer addresses but no Area rows — nobody owns delivery. */
  coverageGap: boolean;
  servingOutlet: string;
}

export const geographyReport = defineReport<GeographyRow>({
  slug: 'geography',
  title: 'Ward & Area',
  description:
    'Orders and revenue by ward and area, with wards that have no delivery agent assigned.',
  filters: ['dateRange', 'ward'],
  periodScoped: true,

  columns: [
    { key: 'ward', header: 'Ward', type: 'text', width: 1.3 },
    { key: 'area', header: 'Area', type: 'text', width: 1.3 },
    { key: 'localBody', header: 'Local Body', type: 'text', width: 1.5 },
    { key: 'servingOutlet', header: 'Outlet', type: 'text', width: 1.2 },
    { key: 'orders', header: 'Orders', type: 'number', width: 0.7 },
    { key: 'customers', header: 'Customers', type: 'number', width: 0.9 },
    { key: 'revenue', header: 'Revenue', type: 'money' },
    { key: 'aov', header: 'Avg Order', type: 'money' },
    { key: 'coverageGap', header: 'No Agent', type: 'bool', width: 0.8 },
    { key: 'district', header: 'District', type: 'text', pdfHidden: true },
    { key: 'wardId', header: 'Ward ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'revenue',
      label: 'Revenue',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.revenue, 0),
    },
    {
      key: 'wards',
      label: 'Wards With Orders',
      type: 'number',
      compute: (rows) => new Set(rows.map((r) => r.wardId)).size,
    },
    {
      key: 'customers',
      label: 'Customers',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.customers, 0),
    },
    {
      key: 'coverageGaps',
      label: 'Ward Rows Without An Agent',
      type: 'number',
      compute: (rows) => rows.filter((r) => r.coverageGap).length,
    },
  ],

  /**
   * One row per ward/area pair that took orders in the period.
   *
   * Ward and area come off the order itself (captured at checkout), not off the
   * customer's current address — a customer who moves must not retroactively
   * rewrite where past orders were delivered.
   *
   * Orders predating ward capture have a null wardId; they are grouped into a
   * single "Unknown ward" row rather than dropped, so this report's revenue
   * still reconciles with the sales report's.
   *
   * `coverageGap` marks a ward with no non-deleted Area rows. Areas are what
   * auto-assign a delivery agent at checkout, so a ward without one falls back
   * to manual dispatch — worth surfacing as an operational gap rather than
   * leaving to be discovered order by order. The ward master data is read from
   * the Ward table, deliberately not from the frontend's bundled Kerala
   * local-bodies JSON, which is ward-creation form data rather than an
   * analytics source.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .leftJoin(Ward, 'w', 'w.id = o.wardId')
      .leftJoin(Area, 'a', 'a.id = o.areaId')
      .leftJoin(Outlets, 'out', 'out.wardId = o.wardId AND out.isDeleted = false')
      .select('o.wardId', 'wardId')
      .addSelect('w.wardNumber', 'wardNumber')
      .addSelect('w.wardName', 'wardName')
      .addSelect('w.localBodyName', 'localBody')
      .addSelect('w.districtName', 'district')
      .addSelect('a.name', 'area')
      .addSelect('out.name', 'servingOutlet')
      .addSelect('COUNT(o.id)', 'orders')
      .addSelect('COALESCE(SUM(o.totalAmount), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT o.userId)', 'customers')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('o.status IN (:...moneyStatuses)', {
        moneyStatuses: MONEY_STATUSES,
      })
      .groupBy('o.wardId')
      .addGroupBy('w.wardNumber')
      .addGroupBy('w.wardName')
      .addGroupBy('w.localBodyName')
      .addGroupBy('w.districtName')
      .addGroupBy('a.name')
      .addGroupBy('out.name')
      .orderBy('COALESCE(SUM(o.totalAmount), 0)', 'DESC')
      .limit(MAX_REPORT_ROWS + 1);

    if (ctx.filters.wardId) {
      qb.andWhere('o.wardId = :reportWardId', {
        reportWardId: ctx.filters.wardId,
      });
    }

    const raw = await qb.getRawMany<{
      wardId: string | null;
      wardNumber: string | null;
      wardName: string | null;
      localBody: string | null;
      district: string | null;
      area: string | null;
      servingOutlet: string | null;
      orders: string;
      revenue: string;
      customers: string;
    }>();

    // Wards that have at least one live area, so the gap flag reflects delivery
    // ownership rather than merely a missing area on this particular order.
    const coveredWards = await ctx.db
      .getRepository(Area)
      .createQueryBuilder('a')
      .select('DISTINCT a.wardId', 'wardId')
      .where('a.isDeleted = false')
      .andWhere('a.isActive = true')
      .getRawMany<{ wardId: string }>();

    const covered = new Set(coveredWards.map((r) => r.wardId));

    return raw.map((r) => {
      const orders = Number(r.orders ?? 0);
      const revenue = Number(r.revenue ?? 0);
      return {
        wardId: r.wardId,
        ward: r.wardId
          ? r.wardName
            ? `${r.wardNumber} · ${r.wardName}`
            : String(r.wardNumber ?? '—')
          : 'Unknown ward',
        localBody: r.localBody ?? '—',
        district: r.district ?? '—',
        area: r.area ?? 'No area',
        servingOutlet: r.servingOutlet ?? 'Unassigned',
        orders,
        revenue,
        customers: Number(r.customers ?? 0),
        aov: orders > 0 ? revenue / orders : 0,
        coverageGap: r.wardId !== null && !covered.has(r.wardId),
      };
    });
  },
});
