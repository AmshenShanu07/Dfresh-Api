import { PurchaseService } from './purchase.service';
import { ProductUnits } from 'src/common/enums';

/**
 * Editing a purchase has to correct the same two counters `create()` wrote:
 * Products.totalQuantity and the per-outlet OutletProductStock ledger. This
 * covers the three reconciliation shapes update() has to handle (same
 * product+outlet delta, product changed, outlet changed) plus the guard that
 * blocks stock-affecting edits once downstream state (cleaning/threshold)
 * exists on the purchase.
 */
class FakeSimpleRepo {
  constructor(private row: any) {}
  async findOne() {
    return this.row;
  }
}

class FakeQueryBuilder {
  constructor(private manager: FakeManager) {}
  private entityId: string;
  private sql: string;
  private params: Record<string, number> = {};
  update() {
    return this;
  }
  set(setObj: any) {
    this.sql = setObj.totalQuantity();
    return this;
  }
  where(_cond: string, whereParams: any) {
    this.entityId = whereParams.id;
    return this;
  }
  setParameter(key: string, value: number) {
    this.params[key] = value;
    return this;
  }
  async execute() {
    const value = Object.values(this.params)[0] as number;
    const signedDelta = this.sql.includes('+') ? value : -value;
    this.manager.productDeltas.push({ id: this.entityId, delta: signedDelta });
    return { affected: 1 };
  }
}

class FakeManager {
  productDeltas: { id: string; delta: number }[] = [];
  purchaseUpdate: { id: string; data: any } | null = null;
  createQueryBuilder() {
    return new FakeQueryBuilder(this);
  }
  async update(_entity: any, id: string, data: any) {
    this.purchaseUpdate = { id, data };
  }
}

class FakeDataSource {
  lastManager: FakeManager | null = null;
  ran = false;
  async transaction(cb: (manager: FakeManager) => Promise<any>) {
    this.ran = true;
    this.lastManager = new FakeManager();
    return cb(this.lastManager);
  }
}

class FakeOutletStockService {
  adjustCalls: { outletId: string; productId: string; delta: number }[] = [];
  async applyPurchaseAdjustment(
    outletId: string,
    productId: string,
    delta: number,
  ) {
    this.adjustCalls.push({ outletId, productId, delta });
  }
}

function buildService(purchaseRow: any) {
  const outletStockService = new FakeOutletStockService();
  const dataSource = new FakeDataSource();
  const service = new PurchaseService(
    new FakeSimpleRepo(purchaseRow) as any, // purchaseRepository
    new FakeSimpleRepo({ id: 'product-1' }) as any, // productRepository
    new FakeSimpleRepo({ id: 'outlet-1' }) as any, // outletRepository
    new FakeSimpleRepo({ id: 'supplier-1' }) as any, // userRepository
    outletStockService as any,
    dataSource as any,
  );
  return { service, outletStockService, dataSource };
}

const basePurchase = {
  id: 'purchase-1',
  productId: 'product-1',
  outletId: 'outlet-1',
  supplierId: 'supplier-1',
  batchNumber: 'B-1',
  quantity: 2,
  quantityUnit: ProductUnits.KG,
  totalPrice: 500,
  releasedQtny: null,
  releasedQntyUnit: null,
  cleanedQnty: null,
  cleanedCount: null,
  thresholdQnty: null,
  thresholdQntyUnit: null,
};

describe('PurchaseService.update reconciles stock counters', () => {
  it('applies a single signed delta when product and outlet are unchanged', async () => {
    const { service, outletStockService, dataSource } = buildService({
      ...basePurchase,
    });

    await service.update('purchase-1', { quantity: 3 });

    expect(dataSource.lastManager!.productDeltas).toEqual([
      { id: 'product-1', delta: 1000 },
    ]);
    expect(outletStockService.adjustCalls).toEqual([
      { outletId: 'outlet-1', productId: 'product-1', delta: 1000 },
    ]);
    expect(dataSource.lastManager!.purchaseUpdate!.data.quantity).toBe(3);
  });

  it('reverses the old product and credits the new one when productId changes', async () => {
    const { service, outletStockService, dataSource } = buildService({
      ...basePurchase,
    });

    await service.update('purchase-1', { productId: 'product-2' });

    expect(dataSource.lastManager!.productDeltas).toEqual([
      { id: 'product-1', delta: -2000 },
      { id: 'product-2', delta: 2000 },
    ]);
    expect(outletStockService.adjustCalls).toEqual([
      { outletId: 'outlet-1', productId: 'product-1', delta: -2000 },
      { outletId: 'outlet-1', productId: 'product-2', delta: 2000 },
    ]);
  });

  it('reverses the old outlet and credits the new one when outletId changes', async () => {
    const { service, outletStockService, dataSource } = buildService({
      ...basePurchase,
    });

    await service.update('purchase-1', { outletId: 'outlet-2' });

    expect(dataSource.lastManager!.productDeltas).toEqual([
      { id: 'product-1', delta: -2000 },
      { id: 'product-1', delta: 2000 },
    ]);
    expect(outletStockService.adjustCalls).toEqual([
      { outletId: 'outlet-1', productId: 'product-1', delta: -2000 },
      { outletId: 'outlet-2', productId: 'product-1', delta: 2000 },
    ]);
  });

  it('blocks quantity/product/outlet edits once cleaning details exist', async () => {
    const { service, dataSource } = buildService({
      ...basePurchase,
      releasedQtny: 1.8,
    });

    await expect(service.update('purchase-1', { quantity: 5 })).rejects.toThrow(
      /cleaning details or a threshold/,
    );
    expect(dataSource.ran).toBe(false);
  });

  it('still allows batch number/price edits after cleaning details exist', async () => {
    const { service, dataSource } = buildService({
      ...basePurchase,
      releasedQtny: 1.8,
    });

    await service.update('purchase-1', { batchNumber: 'B-2', totalPrice: 600 });

    expect(dataSource.ran).toBe(true);
    expect(dataSource.lastManager!.purchaseUpdate!.data.batchNumber).toBe(
      'B-2',
    );
    expect(dataSource.lastManager!.purchaseUpdate!.data.totalPrice).toBe(600);
    expect(dataSource.lastManager!.productDeltas).toEqual([]);
  });
});
