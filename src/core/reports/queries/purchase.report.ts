import { ProductUnits } from 'src/common/enums';
import { Purchase } from '../../purchase/entities/purchase.entity';
import { Products } from '../../product/entities/product.entity';
import { Category } from '../../category/entities/category.entity';
import { Outlets } from '../../outlet/entities/outlet.entity';
import { User } from '../../users/entities/user.entity';
import { defineReport } from '../report-types';
import { MAX_REPORT_ROWS } from '../reports.filters';

export interface PurchaseRow {
  purchaseId: string;
  date: Date;
  batchNumber: string;
  product: string;
  category: string;
  supplier: string;
  outlet: string;
  quantity: number;
  quantityUnit: ProductUnits;
  totalPrice: number;
  /** totalPrice per one `quantityUnit`, e.g. ₹150 per KG. */
  pricePerUnit: number;
}

export const purchaseReport = defineReport<PurchaseRow>({
  slug: 'purchase',
  title: 'Purchase Register',
  description:
    'Every purchase batch in the period, by supplier, outlet and product.',
  filters: ['dateRange', 'supplier', 'category', 'outlet'],
  periodScoped: true,

  columns: [
    { key: 'date', header: 'Date', type: 'date', width: 1 },
    { key: 'batchNumber', header: 'Batch', type: 'text', width: 1 },
    { key: 'product', header: 'Product', type: 'text', width: 1.5 },
    { key: 'category', header: 'Category', type: 'text', width: 1.1 },
    { key: 'supplier', header: 'Supplier', type: 'text', width: 1.3 },
    { key: 'outlet', header: 'Outlet', type: 'text', width: 1.2 },
    {
      key: 'quantity',
      header: 'Quantity',
      type: 'text',
      width: 0.9,
      // Quantity is meaningless without its unit, and the unit varies per row
      // (KG / L / COUNT), so the two are rendered as one cell.
      format: (row) => `${row.quantity} ${row.quantityUnit ?? ''}`.trim(),
    },
    { key: 'totalPrice', header: 'Total', type: 'money' },
    {
      key: 'pricePerUnit',
      header: 'Price/Unit',
      type: 'money',
      width: 0.9,
    },
    { key: 'quantityUnit', header: 'Unit', type: 'text', pdfHidden: true },
    { key: 'purchaseId', header: 'Purchase ID', type: 'text', pdfHidden: true },
  ],

  stats: [
    {
      key: 'spend',
      label: 'Total Spend',
      type: 'money',
      compute: (rows) => rows.reduce((sum, r) => sum + r.totalPrice, 0),
    },
    {
      key: 'batches',
      label: 'Batches',
      type: 'number',
      compute: (rows) => rows.length,
    },
    {
      key: 'suppliers',
      label: 'Suppliers',
      type: 'number',
      compute: (rows) => new Set(rows.map((r) => r.supplier)).size,
    },
    {
      key: 'products',
      label: 'Products',
      type: 'number',
      compute: (rows) => new Set(rows.map((r) => r.product)).size,
    },
  ],

  /**
   * One row per purchase batch — no aggregation, so no fan-out risk.
   *
   * The supplier join goes to the **User** table, not the `Supplier` entity:
   * PurchaseService.create resolves createPurchaseDto.supplierId through
   * userRepository, so a purchase's supplier is a User with userType SUPPLIER.
   * The standalone Supplier table is not what this column reflects.
   *
   * Price per unit is derived rather than stored, and is expressed per the
   * batch's own quantityUnit (₹/KG for a KG batch, ₹/COUNT for eggs). It is
   * deliberately not normalised to a base unit: ₹0.15 per gram is unreadable on
   * a purchase register, and mixing families into one column would be worse.
   */
  async run(ctx) {
    const { from, to } = ctx.range;

    const qb = ctx.db
      .getRepository(Purchase)
      .createQueryBuilder('p')
      .leftJoin(Products, 'prod', 'prod.id = p.productId')
      .leftJoin(Category, 'c', 'c.id = prod.categoryId')
      .leftJoin(User, 'u', 'u.id = p.supplierId')
      .leftJoin(Outlets, 'o', 'o.id = p.outletId')
      .select('p.id', 'purchaseId')
      .addSelect('p.createdAt', 'createdAt')
      .addSelect('p.batchNumber', 'batchNumber')
      .addSelect('p.quantity', 'quantity')
      .addSelect('p.quantityUnit', 'quantityUnit')
      .addSelect('p.totalPrice', 'totalPrice')
      .addSelect('prod.name', 'product')
      .addSelect('c.name', 'category')
      .addSelect('u.name', 'supplier')
      .addSelect('o.name', 'outlet')
      .where('p.createdAt >= :from AND p.createdAt < :to', { from, to })
      .orderBy('p.createdAt', 'DESC')
      .limit(MAX_REPORT_ROWS + 1);

    if (ctx.filters.supplierId) {
      qb.andWhere('p.supplierId = :supplierId', {
        supplierId: ctx.filters.supplierId,
      });
    }
    if (ctx.filters.categoryId) {
      qb.andWhere('prod.categoryId = :categoryId', {
        categoryId: ctx.filters.categoryId,
      });
    }
    // Purchases carry a real outletId, so unlike the order reports this needs
    // no ward derivation.
    if (ctx.filters.outletId) {
      qb.andWhere('p.outletId = :outletId', {
        outletId: ctx.filters.outletId,
      });
    }

    const raw = await qb.getRawMany<{
      purchaseId: string;
      createdAt: Date;
      batchNumber: string | null;
      quantity: string;
      quantityUnit: ProductUnits;
      totalPrice: string;
      product: string | null;
      category: string | null;
      supplier: string | null;
      outlet: string | null;
    }>();

    return raw.map((r) => {
      const quantity = Number(r.quantity ?? 0);
      const totalPrice = Number(r.totalPrice ?? 0);
      return {
        purchaseId: r.purchaseId,
        date: r.createdAt,
        batchNumber: r.batchNumber ?? '—',
        product: r.product ?? '—',
        category: r.category ?? 'Uncategorised',
        supplier: r.supplier ?? '—',
        outlet: r.outlet ?? '—',
        quantity,
        quantityUnit: r.quantityUnit,
        totalPrice,
        // Guard the divide: a zero-quantity batch is a data-entry error, and
        // Infinity would render as a nonsense price rather than a blank.
        pricePerUnit: quantity > 0 ? totalPrice / quantity : 0,
      };
    });
  },
});
