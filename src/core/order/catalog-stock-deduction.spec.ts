import { OrderService } from './order.service';
import { ShareCatalogStatus } from 'src/common/enums';

/**
 * WhatsApp sells from any ACTIVE or LIVE catalog whose window is open
 * (WhatsappService.getOpenCatalog). Deduction used to look for LIVE only, so
 * an in-window ACTIVE catalog — one the cron had not flipped yet, or never
 * would because lastWindowOpenedAt already covered the window — took orders
 * while its allocation stayed untouched.
 */
const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function catalog(status: ShareCatalogStatus, open: boolean) {
  return {
    id: `catalog-${status}`,
    status,
    daysOfWeek: open ? ALL_DAYS : [],
    startTime: '00:00',
    endTime: '23:59',
    ShareCatalogProductStock: [
      { productId: 'product-1', remainingGrams: 10000 },
    ],
  };
}

function buildService(catalogs: any[]) {
  const row: any = {
    id: 'order-1',
    stockDeducted: false,
    wardId: null,
    areaId: null,
    outletId: null,
    orderItems: [
      { productId: 'product-1', quantity: 2, variant: { weight: 1000 } },
    ],
  };
  const savedStock: any[] = [];
  const service = new OrderService(
    {
      async findOne() {
        return { ...row };
      },
      async update(_id: string, patch: any) {
        Object.assign(row, patch);
        return { affected: 1 };
      },
    } as any,
    {} as any, // orderItems
    {} as any, // deliveryDetails
    {} as any, // user
    {} as any, // productVariant
    {
      createQueryBuilder() {
        const chain: any = {
          update: () => chain,
          set: () => chain,
          where: () => chain,
          setParameters: () => chain,
          execute: async () => ({}),
        };
        return chain;
      },
    } as any, // products
    {
      async find() {
        return catalogs;
      },
      // pauseIfExhausted reload — return nothing so it exits early.
      async findOne() {
        return null;
      },
    } as any, // shareCatalog
    {
      async save(s: any) {
        savedStock.push({ ...s });
        return s;
      },
    } as any, // shareCatalogProductStock
    {
      async findOne() {
        return null;
      },
    } as any, // outlets
    {} as any, // staff
    {} as any, // areaService
    {} as any, // outletStockService
  );
  return { service, row, savedStock };
}

describe('applyStockDeduction picks the catalog the customer is buying from', () => {
  it('deducts from an in-window ACTIVE catalog when none is LIVE', async () => {
    const { service, row, savedStock } = buildService([
      catalog(ShareCatalogStatus.ACTIVE, true),
    ]);

    await service.applyStockDeduction('order-1');

    expect(row.stockCatalogId).toBe('catalog-ACTIVE');
    expect(savedStock).toEqual([
      { productId: 'product-1', remainingGrams: 8000 },
    ]);
  });

  it('ignores an ACTIVE catalog whose window is closed', async () => {
    const { service, row, savedStock } = buildService([
      catalog(ShareCatalogStatus.ACTIVE, false),
    ]);

    await service.applyStockDeduction('order-1');

    expect(row.stockCatalogId).toBeUndefined();
    expect(savedStock).toEqual([]);
  });
});
