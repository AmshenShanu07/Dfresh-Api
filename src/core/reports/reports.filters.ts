import { DataSource, SelectQueryBuilder } from 'typeorm';
import { OrderStatus } from 'src/common/enums';
import { Outlets } from '../outlet/entities/outlet.entity';
import { UNASSIGNED_OUTLET } from '../order/order.service';
import {
  ReportDefinition,
  ReportFilterKey,
  ReportFilters,
} from './report-types';

/**
 * Filter plumbing shared by the order-backed reports, so the revenue basis and
 * the outlet derivation exist in exactly one place across all of them.
 */

/**
 * The default "sales" statuses — booked revenue.
 *
 * A CONFIRMED order has committed stock and will be billed; excluding it would
 * under-report the day's trading by everything not yet on a van. DRAFT
 * (abandoned WhatsApp carts), PENDING (unconfirmed) and CANCELLED are excluded.
 *
 * This is deliberately WIDER than DashboardService.getSummary, which counts
 * DELIVERED only because a headline "today's revenue" tile must be realised
 * cash. The two figures are meant to differ; every money report exposes a
 * status filter so an operator can narrow to DELIVERED and reconcile them.
 */
export const MONEY_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.DISPATCHED,
  OrderStatus.DELIVERED,
];

/**
 * Hard ceiling on rows a single report may materialise.
 *
 * Every query applies `.limit(MAX_REPORT_ROWS + 1)`; the extra row is how the
 * service detects truncation without paying for a second COUNT. Only `sales`
 * and `purchase` are row-per-transaction — the other eleven are pre-grouped and
 * bounded by entity counts (products, customers, wards, agents).
 */
export const MAX_REPORT_ROWS = 20_000;

/** Maps a declared filter control to the DTO keys it may populate. */
const FILTER_KEY_FIELDS: Record<ReportFilterKey, (keyof ReportFilters)[]> = {
  dateRange: [], // consumed by resolveReportRange, not by ReportFilters
  status: ['status'],
  supplier: ['supplierId'],
  category: ['categoryId'],
  outlet: ['outletId'],
  ward: ['wardId'],
  agent: ['deliveryAgentId'],
  paymentMethod: ['paymentMethod'],
  product: ['productId'],
  shareCatalog: ['shareCatalogId'],
};

/**
 * Narrows a permissive query DTO down to the filters this report advertises.
 *
 * Enforcement is by narrowing rather than rejecting on purpose: a shared
 * frontend filter bar that leaves a stale `supplierId` in the querystring when
 * you switch from Purchase to Sales should have it ignored, not get a 400. And
 * because `definition.filters` is simultaneously what the UI renders and what
 * this function honours, a report can never quietly read a filter it doesn't
 * advertise.
 */
export function pickFilters(
  definition: ReportDefinition<any>,
  query: Partial<ReportFilters>,
): ReportFilters {
  const allowed = new Set<keyof ReportFilters>(
    definition.filters.flatMap((key) => FILTER_KEY_FIELDS[key] ?? []),
  );

  const filters: ReportFilters = {};
  for (const field of allowed) {
    const value = query[field];
    if (value !== undefined && value !== null && value !== '') {
      (filters as any)[field] = value;
    }
  }
  return filters;
}

/**
 * Applies the order-status filter, defaulting to booked revenue.
 *
 * An explicitly empty array is treated as "no selection" rather than "match
 * nothing" — a status dropdown the operator cleared should show the default,
 * not an empty table with no explanation.
 */
export function applyOrderStatusFilter(
  qb: SelectQueryBuilder<any>,
  alias: string,
  status?: OrderStatus[],
): void {
  const statuses = status?.length ? status : MONEY_STATUSES;
  qb.andWhere(`${alias}.status IN (:...reportStatuses)`, {
    reportStatuses: statuses,
  });
}

/**
 * Filters orders by serving outlet.
 *
 * OrderDetails carries no outletId — it carries the ward the customer chose at
 * checkout, and Outlets.wardId is the bridge. This mirrors OrderService.findAll
 * so the reports and the order list agree on what "orders for this outlet"
 * means.
 *
 * Returns false when the filter can match nothing (an outlet that serves no
 * ward can have no orders routed to it), letting the caller short-circuit to an
 * empty result instead of returning an unfiltered list.
 */
export async function applyOutletFilter(
  db: DataSource,
  qb: SelectQueryBuilder<any>,
  alias: string,
  outletId?: string,
): Promise<boolean> {
  if (!outletId) return true;

  if (outletId === UNASSIGNED_OUTLET) {
    qb.andWhere(`${alias}.wardId IS NULL`);
    return true;
  }

  const outlet = await db
    .getRepository(Outlets)
    .findOne({ where: { id: outletId, isDeleted: false } });

  if (!outlet?.wardId) return false;

  qb.andWhere(`${alias}.wardId = :reportOutletWardId`, {
    reportOutletWardId: outlet.wardId,
  });
  return true;
}
