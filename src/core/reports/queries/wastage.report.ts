import { MeasurementType } from 'src/common/enums';
import { formatAmount } from 'src/common/utils/units';
import { OrderDetails, OrderItems } from '../../order/entities/order.entity';
import { Products } from '../../product/entities/product.entity';
import { ProductVariant } from '../../product/entities/product-variant.entity';
import { Category } from '../../category/entities/category.entity';
import { Purchase } from '../../purchase/entities/purchase.entity';
import { defineReport } from '../report-types';
import {
  MAX_REPORT_ROWS,
  applyOrderStatusFilter,
} from '../reports.filters';
import { toGrams } from './wastage-units';

export interface WastageRow {
  productId: string;
  product: string;
  category: string;
  /** Σ(variant.wastageWeight × units sold) — what we told ourselves to expect. */
  expectedLossG: number;
  /** Σ(purchase.quantity − purchase.cleanedQnty) — what the batches actually lost. */
  actualLossG: number;
  /** actual − expected. Positive means we lost more than modelled. */
  varianceG: number;
  /** Batches that recorded a cleaned quantity; the actual figure's sample size. */
  batchesMeasured: number;
  unitsSold: number;
  purchasedG: number;
  /** actualLoss as a share of the quantity purchased. */
  lossRate: number;
}

export const wastageReport = defineReport<WastageRow>({
  slug: 'wastage',
  title: 'Wastage',
  description:
    'Expected vs actual cleaning loss per product. Weight products only; indicative rather than accounting-grade — see the note below.',
  filters: ['dateRange', 'status', 'category'],
  periodScoped: true,

  columns: [
    { key: 'product', header: 'Product', type: 'text', width: 1.7 },
    { key: 'category', header: 'Category', type: 'text', width: 1.2 },
    { key: 'unitsSold', header: 'Units Sold', type: 'number', width: 0.8 },
    {
      key: 'expectedLossG',
      header: 'Expected Loss',
      type: 'amount',
      format: (row) => formatAmount(row.expectedLossG, MeasurementType.WEIGHT),
    },
    {
      key: 'purchasedG',
      header: 'Purchased',
      type: 'amount',
      format: (row) => formatAmount(row.purchasedG, MeasurementType.WEIGHT),
    },
    {
      key: 'actualLossG',
      header: 'Actual Loss',
      type: 'amount',
      format: (row) => formatAmount(row.actualLossG, MeasurementType.WEIGHT),
    },
    {
      key: 'varianceG',
      header: 'Variance',
      type: 'amount',
      // Signed, and never folded into the two figures it compares.
      format: (row) =>
        `${row.varianceG >= 0 ? '+' : '-'}${formatAmount(
          Math.abs(row.varianceG),
          MeasurementType.WEIGHT,
        )}`,
    },
    { key: 'lossRate', header: 'Loss %', type: 'percent', width: 0.7 },
    {
      key: 'batchesMeasured',
      header: 'Batches',
      type: 'number',
      width: 0.7,
    },
    { key: 'productId', header: 'Product ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'expectedLoss',
      label: 'Expected Loss (kg)',
      type: 'number',
      compute: (rows) =>
        rows.reduce((sum, r) => sum + r.expectedLossG, 0) / 1000,
    },
    {
      key: 'actualLoss',
      label: 'Actual Loss (kg)',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.actualLossG, 0) / 1000,
    },
    {
      key: 'variance',
      label: 'Variance (kg)',
      type: 'number',
      compute: (rows) => rows.reduce((sum, r) => sum + r.varianceG, 0) / 1000,
    },
    {
      key: 'products',
      label: 'Products',
      type: 'number',
      compute: (rows) => rows.length,
    },
  ],

  /**
   * Expected vs actual cleaning loss, per product.
   *
   * READ THIS BEFORE TRUSTING THE VARIANCE COLUMN. The two sides of the
   * comparison have different grains and different denominators:
   *
   *  - EXPECTED is per order line: ProductVariant.wastageWeight (grams lost
   *    when cleaning one unit of that variant) multiplied by units sold in the
   *    period.
   *  - ACTUAL is per purchase batch: Purchase.quantity minus
   *    Purchase.cleanedQnty, for batches bought in the period.
   *
   * A batch bought on the 1st may be sold across three weeks, so within any one
   * period the two columns are not measuring the same physical produce. Joined
   * per product over a date range the variance is an INDICATIVE signal — "our
   * per-variant wastage estimate looks roughly right / badly wrong for this
   * product" — not an accounting reconciliation. They are shown as adjacent
   * columns and never summed into a single "wastage" figure for that reason.
   *
   * WEIGHT PRODUCTS ONLY. ProductVariant.wastageWeight is documented as
   * meaningful only for WEIGHT and held at 0 for VOLUME/COUNT, so those
   * products are excluded rather than shown with a misleading zero.
   *
   * All arithmetic goes through toGrams (spec'd separately) because the two
   * sources use different unit conventions — the Purchase enum is uppercase,
   * and the variant column is already in base units.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    // Expected loss, from what was actually sold.
    const soldQb = ctx.db
      .getRepository(OrderItems)
      .createQueryBuilder('item')
      .innerJoin(OrderDetails, 'o', 'o.id = item.orderId')
      .innerJoin(ProductVariant, 'v', 'v.id = item.variantId')
      .innerJoin(Products, 'p', 'p.id = item.productId')
      .leftJoin(Category, 'c', 'c.id = p.categoryId')
      .select('p.id', 'productId')
      .addSelect("p.name->>'en'", 'product')
      .addSelect("c.name->>'en'", 'category')
      .addSelect('SUM(item.quantity * v.wastageWeight)', 'expectedLossG')
      .addSelect('SUM(item.quantity)', 'unitsSold')
      .where('o.createdAt >= :from AND o.createdAt < :to', { from, to })
      .andWhere('p.measurementType = :weight', {
        weight: MeasurementType.WEIGHT,
      })
      .groupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('c.name')
      .limit(MAX_REPORT_ROWS + 1);

    applyOrderStatusFilter(soldQb, 'o', ctx.filters.status);

    if (ctx.filters.categoryId) {
      soldQb.andWhere('p.categoryId = :categoryId', {
        categoryId: ctx.filters.categoryId,
      });
    }

    const soldRows = await soldQb.getRawMany<{
      productId: string;
      product: string;
      category: string | null;
      expectedLossG: string;
      unitsSold: string;
    }>();

    /**
     * Actual loss, from purchase batches. Units are per row, so the conversion
     * cannot be pushed into SQL without encoding the enum there — the rows come
     * back raw and are normalised in TS via toGrams.
     */
    const purchaseQb = ctx.db
      .getRepository(Purchase)
      .createQueryBuilder('pur')
      .innerJoin(Products, 'p', 'p.id = pur.productId')
      .select('pur.productId', 'productId')
      .addSelect("p.name->>'en'", 'product')
      .addSelect('pur.quantity', 'quantity')
      .addSelect('pur.quantityUnit', 'quantityUnit')
      .addSelect('pur.cleanedQnty', 'cleanedQnty')
      .addSelect('pur.cleanedQntyUnit', 'cleanedQntyUnit')
      .where('pur.createdAt >= :from AND pur.createdAt < :to', { from, to })
      .andWhere('p.measurementType = :weight', {
        weight: MeasurementType.WEIGHT,
      })
      // Only batches where cleaning was actually recorded can evidence a loss;
      // a null cleanedQnty means "not measured", not "lost nothing".
      .andWhere('pur.cleanedQnty IS NOT NULL')
      .limit(MAX_REPORT_ROWS + 1);

    if (ctx.filters.categoryId) {
      purchaseQb.andWhere('p.categoryId = :categoryId', {
        categoryId: ctx.filters.categoryId,
      });
    }

    const purchaseRows = await purchaseQb.getRawMany<{
      productId: string;
      product: string;
      quantity: string;
      quantityUnit: string;
      cleanedQnty: string;
      cleanedQntyUnit: string | null;
    }>();

    const actuals = new Map<
      string,
      { product: string; purchasedG: number; lossG: number; batches: number }
    >();

    for (const row of purchaseRows) {
      const purchasedG = toGrams(row.quantity, row.quantityUnit);
      // cleanedQntyUnit is nullable; when it is missing the batch was recorded
      // in the same unit it was bought in.
      const cleanedG = toGrams(
        row.cleanedQnty,
        row.cleanedQntyUnit ?? row.quantityUnit,
      );
      if (purchasedG <= 0) continue;

      const entry = actuals.get(row.productId) ?? {
        product: row.product,
        purchasedG: 0,
        lossG: 0,
        batches: 0,
      };
      entry.purchasedG += purchasedG;
      // Clamped at 0: a cleaned weight above the purchased weight is a
      // data-entry error, and a negative loss would offset real losses on
      // other batches into an understated total.
      entry.lossG += Math.max(0, purchasedG - cleanedG);
      entry.batches += 1;
      actuals.set(row.productId, entry);
    }

    // Union: a product may have sales without purchases in the period, or the
    // reverse. Dropping either side would hide exactly the mismatch the report
    // exists to show.
    const productIds = new Set([
      ...soldRows.map((r) => r.productId),
      ...actuals.keys(),
    ]);

    const soldById = new Map(soldRows.map((r) => [r.productId, r]));

    return [...productIds]
      .map((productId) => {
        const sold = soldById.get(productId);
        const actual = actuals.get(productId);

        const expectedLossG = Number(sold?.expectedLossG ?? 0);
        const actualLossG = actual?.lossG ?? 0;
        const purchasedG = actual?.purchasedG ?? 0;

        return {
          productId,
          product: sold?.product ?? actual?.product ?? '—',
          category: sold?.category ?? 'Uncategorised',
          expectedLossG,
          actualLossG,
          varianceG: actualLossG - expectedLossG,
          batchesMeasured: actual?.batches ?? 0,
          unitsSold: Number(sold?.unitsSold ?? 0),
          purchasedG,
          lossRate: purchasedG > 0 ? (actualLossG / purchasedG) * 100 : 0,
        };
      })
      .sort((a, b) => Math.abs(b.varianceG) - Math.abs(a.varianceG));
  },
});
