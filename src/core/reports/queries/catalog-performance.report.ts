import { ShareCatalogStatus } from 'src/common/enums';
import { OrderDetails } from '../../order/entities/order.entity';
import { ShareCatalog } from '../../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../../share-catlaog/entities/share-catalog-product-stock.entity';
import { Catalog } from '../../catlog/entities/catalog.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS, MONEY_STATUSES } from '../reports.filters';

export interface CatalogPerformanceRow {
  shareCatalogId: string | null;
  catalog: string;
  status: string;
  schedule: string;
  lastOpenedAt: Date | null;
  /** Period-scoped: orders attributed to this catalog via stockCatalogId. */
  orders: number;
  revenue: number;
  /** Snapshot, NOT period-scoped: the current allocation. See run(). */
  productsOffered: number;
  productsExhausted: number;
  avgSellThrough: number;
}

/** Sentinel row for revenue that carries no catalog attribution. */
const UNATTRIBUTED = 'Unattributed';

export const catalogPerformanceReport = defineReport<CatalogPerformanceRow>({
  slug: 'catalog-performance',
  title: 'Catalog Performance',
  description:
    'Revenue attributed to each share-catalog window in the period, with its current stock allocation.',
  filters: ['dateRange'],
  periodScoped: true,

  columns: [
    { key: 'catalog', header: 'Catalog', type: 'text', width: 1.7 },
    { key: 'status', header: 'Status', type: 'text', width: 0.9 },
    { key: 'schedule', header: 'Schedule', type: 'text', width: 1.7 },
    { key: 'orders', header: 'Orders', type: 'number', width: 0.7 },
    { key: 'revenue', header: 'Revenue', type: 'money' },
    { key: 'productsOffered', header: 'Products', type: 'number', width: 0.8 },
    { key: 'productsExhausted', header: 'Exhausted', type: 'number', width: 0.9 },
    { key: 'avgSellThrough', header: 'Sell-through', type: 'percent' },
    { key: 'lastOpenedAt', header: 'Last Opened', type: 'datetime' },
    {
      key: 'shareCatalogId',
      header: 'Catalog ID',
      type: 'text',
      pdfHidden: true,
    },
  ],

  stats: [
    {
      key: 'revenue',
      label: 'Attributed Revenue',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.revenue, 0),
    },
    {
      key: 'orders',
      label: 'Orders',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.orders, 0),
    },
    {
      key: 'unattributed',
      label: 'Unattributed Revenue',
      type: 'money',
      compute: (rows) =>
        rows
          .filter((r) => r.shareCatalogId === null)
          .reduce((sum, r) => sum + r.revenue, 0),
    },
    {
      key: 'catalogs',
      label: 'Catalogs With Sales',
      type: 'number',
      compute: (rows) =>
        rows.filter((r) => r.shareCatalogId !== null && r.orders > 0).length,
    },
  ],

  /**
   * Per share-catalog window. This report mixes two scopes on purpose, and the
   * column headers have to be read with that in mind.
   *
   * REVENUE is period-scoped and attributed through OrderDetails.stockCatalogId.
   * That column is written only inside OrderService.applyStockDeduction, and
   * only when a catalog was LIVE at the moment the order was confirmed. Orders
   * confirmed outside a window, orders that never confirmed, and everything
   * predating the column all carry NULL — so they are surfaced as an explicit
   * "Unattributed" row rather than being dropped, which would silently shrink
   * total revenue relative to the sales report.
   *
   * STOCK is a snapshot, not period-scoped. ShareCatalogProductStock is never
   * reset when a window opens, so a past window's offered/remaining figures are
   * genuinely not reconstructible — only the current allocation exists. The
   * offered/exhausted/sell-through columns therefore describe the catalog as it
   * stands now, whatever period is selected. True per-window history would need
   * a new snapshot table written by the cron; that is a schema change, not a
   * reporting one.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    // Revenue per catalog, including the NULL bucket.
    const revenueRows = await ctx.db
      .getRepository(OrderDetails)
      .createQueryBuilder('o')
      .select('o.stockCatalogId', 'shareCatalogId')
      .addSelect('COUNT(o.id)', 'orders')
      .addSelect('COALESCE(SUM(o.totalAmount), 0)', 'revenue')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('o.status IN (:...moneyStatuses)', {
        moneyStatuses: MONEY_STATUSES,
      })
      .groupBy('o.stockCatalogId')
      .getRawMany<{
        shareCatalogId: string | null;
        orders: string;
        revenue: string;
      }>();

    const revenueByCatalog = new Map(
      revenueRows.map((r) => [
        r.shareCatalogId,
        { orders: Number(r.orders ?? 0), revenue: Number(r.revenue ?? 0) },
      ]),
    );

    const catalogs = await ctx.db
      .getRepository(ShareCatalog)
      .createQueryBuilder('sc')
      .leftJoin(Catalog, 'c', 'c.id = sc.catalogId')
      .select('sc.id', 'shareCatalogId')
      .addSelect('c.name', 'catalog')
      .addSelect('sc.status', 'status')
      .addSelect('sc.daysOfWeek', 'daysOfWeek')
      .addSelect('sc.startTime', 'startTime')
      .addSelect('sc.endTime', 'endTime')
      .addSelect('sc.lastWindowOpenedAt', 'lastOpenedAt')
      .where('sc.isDeleted = false')
      .orderBy('sc.lastWindowOpenedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('sc.createdAt', 'DESC')
      .limit(MAX_REPORT_ROWS + 1)
      .getRawMany<{
        shareCatalogId: string;
        catalog: string | null;
        status: ShareCatalogStatus;
        daysOfWeek: string | string[] | null;
        startTime: string;
        endTime: string;
        lastOpenedAt: Date | null;
      }>();

    const stockRows = await ctx.db
      .getRepository(ShareCatalogProductStock)
      .createQueryBuilder('s')
      .select('s.shareCatalogId', 'shareCatalogId')
      .addSelect('COUNT(s.id)', 'productsOffered')
      .addSelect(
        'COUNT(s.id) FILTER (WHERE s.remainingGrams <= 0 AND s.offeredGrams > 0)',
        'productsExhausted',
      )
      // Averaging the per-product ratio, not summing amounts — offered/remaining
      // hold different units per measurement family and cannot be added.
      .addSelect(
        `COALESCE(AVG(CASE WHEN s.offeredGrams > 0
            THEN GREATEST(0, s.offeredGrams - s.remainingGrams) / s.offeredGrams
            ELSE 0 END) * 100, 0)`,
        'avgSellThrough',
      )
      .groupBy('s.shareCatalogId')
      .getRawMany<{
        shareCatalogId: string;
        productsOffered: string;
        productsExhausted: string;
        avgSellThrough: string;
      }>();

    const stockByCatalog = new Map(stockRows.map((r) => [r.shareCatalogId, r]));

    const rows: CatalogPerformanceRow[] = catalogs.map((c) => {
      const revenue = revenueByCatalog.get(c.shareCatalogId);
      const stock = stockByCatalog.get(c.shareCatalogId);
      // simple-array columns come back as a comma-joined string over raw SQL.
      const days = Array.isArray(c.daysOfWeek)
        ? c.daysOfWeek
        : String(c.daysOfWeek ?? '')
            .split(',')
            .filter(Boolean);

      return {
        shareCatalogId: c.shareCatalogId,
        catalog: c.catalog ?? 'Untitled catalog',
        status: c.status,
        schedule: days.length
          ? `${days.join(', ')} · ${c.startTime}–${c.endTime}`
          : `${c.startTime}–${c.endTime}`,
        lastOpenedAt: c.lastOpenedAt,
        orders: revenue?.orders ?? 0,
        revenue: revenue?.revenue ?? 0,
        productsOffered: Number(stock?.productsOffered ?? 0),
        productsExhausted: Number(stock?.productsExhausted ?? 0),
        avgSellThrough: Number(stock?.avgSellThrough ?? 0),
      };
    });

    const unattributed = revenueByCatalog.get(null);
    if (unattributed && unattributed.orders > 0) {
      rows.push({
        shareCatalogId: null,
        catalog: UNATTRIBUTED,
        status: '—',
        schedule: 'Confirmed outside a live catalog window',
        lastOpenedAt: null,
        orders: unattributed.orders,
        revenue: unattributed.revenue,
        productsOffered: 0,
        productsExhausted: 0,
        avgSellThrough: 0,
      });
    }

    return rows.sort((a, b) => b.revenue - a.revenue);
  },
});
