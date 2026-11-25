import { BadRequestException } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { ProductUnits } from 'src/common/enums';

/**
 * Stock can only be received into a live outlet: creating a purchase, or
 * moving one to another outlet, must reject a deleted or inactive outlet.
 * The repo fake applies the `where` clause so the query is what is tested.
 */
const OUTLETS = [
  { id: 'live', isDeleted: false, isActive: true },
  { id: 'inactive', isDeleted: false, isActive: false },
  { id: 'deleted', isDeleted: true, isActive: true },
];

class FakeRepo {
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
    return { affected: 1 };
  }
}

const outletRepo = {
  async findOne({ where }: any) {
    return (
      OUTLETS.find((o) =>
        Object.entries(where).every(([k, v]) => (o as any)[k] === v),
      ) ?? null
    );
  },
};

function buildService(existingPurchase: any = null) {
  return new PurchaseService(
    new FakeRepo(existingPurchase) as any,
    new FakeRepo({ id: 'product-1' }) as any,
    outletRepo as any,
    new FakeRepo({ id: 'supplier-1' }) as any,
    { async applyPurchaseIn() {}, async applyPurchaseAdjustment() {} } as any,
    {} as any, // dataSource — not reached: the outlet check throws first
  );
}

const input = (outletId: string) => ({
  productId: 'product-1',
  outletId,
  supplierId: 'supplier-1',
  batchNumber: 'B-1',
  quantity: 1,
  quantityUnit: ProductUnits.KG,
  totalPrice: 100,
});

describe('PurchaseService rejects inactive or deleted outlets', () => {
  it('creates a purchase for a live outlet', async () => {
    await expect(buildService().create(input('live'))).resolves.toMatchObject({
      outletId: 'live',
    });
  });

  it.each(['inactive', 'deleted'])(
    'refuses to create for a %s outlet',
    async (id) => {
      await expect(buildService().create(input(id))).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  it('refuses to move a purchase to an inactive outlet', async () => {
    const service = buildService({ id: 'p-1', ...input('live') });

    await expect(
      service.update('p-1', { outletId: 'inactive' }),
    ).rejects.toThrow('Outlet not found or inactive');
  });
});
