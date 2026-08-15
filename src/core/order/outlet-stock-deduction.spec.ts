import { Repository } from 'typeorm';
import { OrderService } from './order.service';
import { OrderDetails } from './entities/order.entity';
import { OrderStatus, PaymentStatus } from 'src/common/enums';

/**
 * Order confirm/cancel must also move stock on the resolved fulfilling
 * outlet's own ledger (via OutletStockService), on top of the existing
 * global Products.totalQuantity counter. The fulfilling outlet is resolved
 * once, at first deduction: Area.outletId when the order has an areaId,
 * else the oldest active outlet for the order's wardId (the same fallback
 * dispatch already used) — and persisted on OrderDetails.outletId so a later
 * cancellation restores the same outlet regardless of any subsequent
 * ward/outlet changes.
 */
class FakeOrderDetailsRepository {
  constructor(public row: Partial<OrderDetails> | null) {}
  async findOne(_opts: any) {
    return this.row ? { ...this.row } : null;
  }
  async update(_id: string, patch: Partial<OrderDetails>) {
    if (this.row) Object.assign(this.row, patch);
    return { affected: 1 } as any;
  }
}

// No LIVE catalog anywhere in these tests — keeps them focused on the outlet
// wiring, the global/share-catalog counters are exercised elsewhere.
class FakeShareCatalogRepository {
  async findOne() {
    return null;
  }
}

class FakeProductRepository {
  createQueryBuilder() {
    const chain: any = {
      update: () => chain,
      set: () => chain,
      where: () => chain,
      setParameters: () => chain,
      execute: async () => ({}),
    };
    return chain;
  }
  async increment() {
    return { affected: 1 } as any;
  }
}

class FakeOutletRepository {
  constructor(private row: any) {}
  async findOne(_opts: any) {
    return this.row;
  }
}

class FakeAreaService {
  constructor(private area: any) {}
  async findOneActive(id: string) {
    return this.area && this.area.id === id ? this.area : null;
  }
}

class FakeOutletStockService {
  applied: { outletId: string; productId: string; baseQty: number }[] = [];
  restored: { outletId: string; productId: string; baseQty: number }[] = [];
  async applyOrderConsumption(outletId: string, productId: string, baseQty: number) {
    this.applied.push({ outletId, productId, baseQty });
  }
  async restoreOrderConsumption(outletId: string, productId: string, baseQty: number) {
    this.restored.push({ outletId, productId, baseQty });
  }
}

function buildService({
  row,
  outlet = null,
  area = null,
}: {
  row: Partial<OrderDetails> | null;
  outlet?: any;
  area?: any;
}) {
  const orderRepo = new FakeOrderDetailsRepository(row);
  const outletStockService = new FakeOutletStockService();
  const service = new OrderService(
    orderRepo as unknown as Repository<OrderDetails>,
    {} as any, // orderItems
    {} as any, // deliveryDetails
    {} as any, // user
    {} as any, // productVariant
    new FakeProductRepository() as any, // products
    new FakeShareCatalogRepository() as any, // shareCatalog
    {} as any, // shareCatalogProductStock
    new FakeOutletRepository(outlet) as any, // outlets
    {} as any, // staff
    new FakeAreaService(area) as any, // areaService
    outletStockService as any,
  );
  return { service, orderRepo, outletStockService };
}

const orderItems = [
  {
    productId: 'product-1',
    quantity: 2,
    variant: { weight: 500 }, // 500g x 2 = 1000g
  },
];

describe('applyStockDeduction resolves and credits the fulfilling outlet', () => {
  it('uses Area.outletId when the order has an areaId', async () => {
    const { service, orderRepo, outletStockService } = buildService({
      row: {
        id: 'order-1',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
        stockDeducted: false,
        wardId: 'ward-1',
        areaId: 'area-1',
        outletId: null,
        orderItems,
      } as any,
      area: { id: 'area-1', outletId: 'outlet-from-area' },
      outlet: { id: 'outlet-from-ward' }, // must NOT be used when an area resolves
    });

    await service.applyStockDeduction('order-1');

    expect(orderRepo.row!.outletId).toBe('outlet-from-area');
    expect(outletStockService.applied).toEqual([
      { outletId: 'outlet-from-area', productId: 'product-1', baseQty: 1000 },
    ]);
  });

  it('falls back to the oldest outlet for the ward when there is no area', async () => {
    const { service, orderRepo, outletStockService } = buildService({
      row: {
        id: 'order-1',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
        stockDeducted: false,
        wardId: 'ward-1',
        areaId: null,
        outletId: null,
        orderItems,
      } as any,
      outlet: { id: 'outlet-from-ward' },
    });

    await service.applyStockDeduction('order-1');

    expect(orderRepo.row!.outletId).toBe('outlet-from-ward');
    expect(outletStockService.applied).toEqual([
      { outletId: 'outlet-from-ward', productId: 'product-1', baseQty: 1000 },
    ]);
  });

  it('leaves outletId null and skips the outlet ledger when no outlet resolves', async () => {
    const { service, orderRepo, outletStockService } = buildService({
      row: {
        id: 'order-1',
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.NOT_REQUIRED,
        stockDeducted: false,
        wardId: null,
        areaId: null,
        outletId: null,
        orderItems,
      } as any,
      outlet: null,
    });

    await service.applyStockDeduction('order-1');

    expect(orderRepo.row!.outletId).toBeNull();
    expect(outletStockService.applied).toEqual([]);
  });
});

describe('restoreStock credits back the persisted outlet, never re-derived', () => {
  it('restores the outlet stock recorded on the order at deduction time', async () => {
    const { service, outletStockService } = buildService({
      row: {
        id: 'order-1',
        status: OrderStatus.PENDING,
        stockDeducted: true,
        stockCatalogId: null,
        outletId: 'outlet-from-area',
        orderItems,
      } as any,
      // A different outlet now serves the ward — must NOT affect the restore.
      outlet: { id: 'a-different-outlet' },
    });

    await service.cancelOrder('order-1');

    expect(outletStockService.restored).toEqual([
      { outletId: 'outlet-from-area', productId: 'product-1', baseQty: 1000 },
    ]);
  });

  it('skips the outlet ledger when the order never had an outlet resolved', async () => {
    const { service, outletStockService } = buildService({
      row: {
        id: 'order-1',
        status: OrderStatus.PENDING,
        stockDeducted: true,
        stockCatalogId: null,
        outletId: null,
        orderItems,
      } as any,
    });

    await service.cancelOrder('order-1');

    expect(outletStockService.restored).toEqual([]);
  });
});
