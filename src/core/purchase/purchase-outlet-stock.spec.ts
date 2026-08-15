import { PurchaseService } from './purchase.service';
import { ProductUnits } from 'src/common/enums';

/**
 * A Purchase already carries the receiving outlet (Purchase.outletId), but
 * used to feed only the global Products.totalQuantity counter. It must now
 * also credit that outlet's own stock ledger via OutletStockService.
 */
class FakeSimpleRepo {
  constructor(private row: any) {}
  async findOne() {
    return this.row;
  }
  create(data: any) {
    return { ...data };
  }
  async save(data: any) {
    return { id: 'purchase-1', ...data };
  }
  async increment() {
    return { affected: 1 } as any;
  }
}

class FakeOutletStockService {
  calls: { outletId: string; productId: string; baseQty: number }[] = [];
  async applyPurchaseIn(outletId: string, productId: string, baseQty: number) {
    this.calls.push({ outletId, productId, baseQty });
  }
}

function buildService() {
  const outletStockService = new FakeOutletStockService();
  const service = new PurchaseService(
    new FakeSimpleRepo(null) as any, // purchaseRepository
    new FakeSimpleRepo({ id: 'product-1' }) as any, // productRepository
    new FakeSimpleRepo({ id: 'outlet-1' }) as any, // outletRepository
    new FakeSimpleRepo({ id: 'supplier-1' }) as any, // userRepository
    outletStockService as any,
  );
  return { service, outletStockService };
}

describe('PurchaseService.create credits the receiving outlet\'s stock', () => {
  it('calls OutletStockService.applyPurchaseIn with the base-unit quantity', async () => {
    const { service, outletStockService } = buildService();

    await service.create({
      productId: 'product-1',
      outletId: 'outlet-1',
      supplierId: 'supplier-1',
      batchNumber: 'B-1',
      quantity: 2,
      quantityUnit: ProductUnits.KG,
      totalPrice: 500,
    });

    expect(outletStockService.calls).toEqual([
      { outletId: 'outlet-1', productId: 'product-1', baseQty: 2000 },
    ]);
  });
});
