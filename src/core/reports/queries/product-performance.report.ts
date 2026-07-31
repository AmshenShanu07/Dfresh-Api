import { MeasurementType } from 'src/common/enums';
import { formatAmount } from 'src/common/utils/units';
import { OrderDetails, OrderItems } from '../../order/entities/order.entity';
import { Products } from '../../product/entities/product.entity';
import { ProductVariant } from '../../product/entities/product-variant.entity';
import { Category } from '../../category/entities/category.entity';
import { defineReport } from '../report-types';
import {
  MAX_REPORT_ROWS,
  applyOrderStatusFilter,
  applyOutletFilter,
} from '../reports.filters';

export interface ProductPerformanceRow {
  variantId: string;
  product: string;
  variantLabel: string;
  category: string;
  measurementType: MeasurementType;
  /** Quantity sold in the product's base unit (g / ml / count). */
  soldBase: number;
  units: number;
  revenue: number;
  orders: number;
  /** Share of the report's total revenue. */
  revenueShare: number;
}

export const productPerformanceReport = defineReport<ProductPerformanceRow>({
  slug: 'product-performance',
  title: 'Product Performance',
  description:
    'Quantity sold, revenue and order count per product variant in the period.',
  filters: ['dateRange', 'status', 'category', 'outlet'],
  periodScoped: true,

  columns: [
    { key: 'product', header: 'Product', type: 'text', width: 1.6 },
    { key: 'variantLabel', header: 'Variant', type: 'text', width: 0.9 },
    { key: 'category', header: 'Category', type: 'text', width: 1.2 },
    {
      key: 'soldBase',
      header: 'Quantity Sold',
      type: 'amount',
      width: 1.1,
      // Base units are meaningless without the product's measurement family —
      // 1500 is 1.5kg for a WEIGHT product and 1500 eggs for a COUNT one.
      format: (row) => formatAmount(row.soldBase, row.measurementType),
    },
    { key: 'units', header: 'Units', type: 'number', width: 0.7 },
    { key: 'orders', header: 'Orders', type: 'number', width: 0.7 },
    { key: 'revenue', header: 'Revenue', type: 'money' },
    { key: 'revenueShare', header: 'Share', type: 'percent', width: 0.7 },
    { key: 'variantId', header: 'Variant ID', type: 'text', pdfHidden: true },
    {
      key: 'measurementType',
      header: 'Measurement',
      type: 'text',
      pdfHidden: true,
    },
  ],

  stats: [
    {
      key: 'revenue',
      label: 'Revenue',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.revenue, 0),
    },
    {
      key: 'variants',
      label: 'Variants Sold',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'products',
      label: 'Products Sold',
      type: 'number',
      compute: (rows) => new Set(rows.map((r) => r.product)).size,
    },
    {
      key: 'units',
      label: 'Units Sold',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.units, 0),
    },
  ],

  /**
   * One row per variant sold in the period.
   *
   * Quantity is `OrderItems.quantity * ProductVariants.weight` — `weight` is
   * already stored in the product's base unit — and the variant join is an
   * INNER join, both matching DashboardService.getTopSelling exactly so the two
   * views cannot disagree. (An item with a null variantId would contribute NULL
   * and poison the SUM, which is why inner rather than left here, unlike the
   * sales report where the goal is to surface such orders.)
   *
   * Revenue uses OrderItems.totalPrice, which already includes the per-unit
   * cleaning and cutting charges multiplied by quantity — so summing it across
   * variants reconciles with the sales report's produce+cleaning+cutting.
   *
   * No fan-out concern: this aggregates the item rows themselves rather than
   * repeating an order-level total across them.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(OrderItems)
      .createQueryBuilder('item')
      .innerJoin(OrderDetails, 'o', 'o.id = item.orderId')
      .innerJoin(ProductVariant, 'v', 'v.id = item.variantId')
      .innerJoin(Products, 'p', 'p.id = item.productId')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      .select('v.id', 'variantId')
      .addSelect('p.name', 'product')
      .addSelect('p.measurementType', 'measurementType')
      .addSelect('v.weight', 'variantWeight')
      .addSelect('v.unit', 'variantUnit')
      .addSelect('c.name', 'category')
      .addSelect('SUM(item.quantity * v.weight)', 'soldBase')
      .addSelect('SUM(item.quantity)', 'units')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT o.id)', 'orders')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .groupBy('v.id')
      .addGroupBy('p.name')
      .addGroupBy('p.measurementType')
      .addGroupBy('v.weight')
      .addGroupBy('v.unit')
      .addGroupBy('c.name')
      .orderBy('COALESCE(SUM(item.totalPrice), 0)', 'DESC')
      .limit(MAX_REPORT_ROWS + 1);

    applyOrderStatusFilter(qb, 'o', ctx.filters.status);

    if (ctx.filters.categoryId) {
      qb.andWhere('p.categoryId = :categoryId', {
        categoryId: ctx.filters.categoryId,
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
      variantId: string;
      product: string;
      measurementType: MeasurementType;
      variantWeight: string;
      variantUnit: string;
      category: string | null;
      soldBase: string;
      units: string;
      revenue: string;
      orders: string;
    }>();

    const totalRevenue = raw.reduce((sum, r) => sum + Number(r.revenue ?? 0), 0);

    return raw.map((r) => {
      const measurementType = r.measurementType ?? MeasurementType.WEIGHT;
      const revenue = Number(r.revenue ?? 0);
      return {
        variantId: r.variantId,
        product: r.product,
        // The variant's own size, formatted in its family's terms.
        variantLabel: formatAmount(Number(r.variantWeight ?? 0), measurementType),
        category: r.category ?? 'Uncategorised',
        measurementType,
        soldBase: Number(r.soldBase ?? 0),
        units: Number(r.units ?? 0),
        revenue,
        orders: Number(r.orders ?? 0),
        revenueShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      };
    });
  },
});
