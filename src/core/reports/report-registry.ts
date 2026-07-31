import { ReportDefinition, ReportSlug } from './report-types';
import { salesReport } from './queries/sales.report';
import { purchaseReport } from './queries/purchase.report';
import { customerOrdersReport } from './queries/customer-orders.report';
import { productPerformanceReport } from './queries/product-performance.report';
import { paymentsReport } from './queries/payments.report';
import { deliveryAgentsReport } from './queries/delivery-agents.report';
import { stockMasterReport } from './queries/stock-master.report';
import { customerAcquisitionReport } from './queries/customer-acquisition.report';
import { stockCatalogReport } from './queries/stock-catalog.report';
import { catalogPerformanceReport } from './queries/catalog-performance.report';
import { geographyReport } from './queries/geography.report';
import { abandonedCartsReport } from './queries/abandoned-carts.report';
import { wastageReport } from './queries/wastage.report';

/**
 * Every report the API serves, keyed by slug.
 *
 * This is the only place a report is registered. The controller resolves
 * `/reports/:slug` straight out of here, `GET /reports` lists it, and
 * report-registry.spec.ts asserts the structural invariants across all entries
 * — which is what keeps thirteen near-identical definition files honest.
 */
export const REPORTS: Partial<Record<ReportSlug, ReportDefinition<any>>> = {
  sales: salesReport,
  purchase: purchaseReport,
  'customer-orders': customerOrdersReport,
  'product-performance': productPerformanceReport,
  payments: paymentsReport,
  'delivery-agents': deliveryAgentsReport,
  'stock-master': stockMasterReport,
  'customer-acquisition': customerAcquisitionReport,
  'stock-catalog': stockCatalogReport,
  'catalog-performance': catalogPerformanceReport,
  geography: geographyReport,
  'abandoned-carts': abandonedCartsReport,
  wastage: wastageReport,
};

export function getReportDefinition(
  slug: string,
): ReportDefinition<any> | undefined {
  return REPORTS[slug as ReportSlug];
}

/** Slug + metadata for the landing page and Swagger discovery. */
export function listReportDefinitions() {
  return Object.values(REPORTS).map((definition) => ({
    slug: definition.slug,
    title: definition.title,
    description: definition.description,
    filters: definition.filters,
    periodScoped: definition.periodScoped,
  }));
}
