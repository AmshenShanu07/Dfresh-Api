import { Repository } from 'typeorm';
import { OrderService } from './order.service';
import { DeliveryDetails } from './entities/order.entity';

/**
 * In-memory stand-in for the DeliveryDetails repository that enforces the
 * `unique` constraint on `orderId` the same way Postgres does: a plain
 * insert/save for an orderId that already has a row throws, while `upsert`
 * overwrites the existing row. This reproduces the production failure where a
 * second address submission for the same order violated UQ_...orderId.
 */
class FakeDeliveryDetailsRepository {
  rows = new Map<string, Partial<DeliveryDetails>>();

  create(data: Partial<DeliveryDetails>) {
    return data;
  }

  async save(entity: Partial<DeliveryDetails>) {
    if (this.rows.has(entity.orderId!)) {
      throw new Error(
        'duplicate key value violates unique constraint "UQ_89f3eb6ddf769977eb5a6bdfc6e"',
      );
    }
    this.rows.set(entity.orderId!, entity);
    return entity;
  }

  async upsert(entity: Partial<DeliveryDetails>, _conflictPaths: string[]) {
    this.rows.set(entity.orderId!, entity);
    return { identifiers: [], generatedMaps: [], raw: [] };
  }
}

// Minimal orderDetails repo so the methods can complete past the delivery write.
class FakeOrderDetailsRepository {
  async update() {
    return { affected: 1 } as any;
  }
  async findOne() {
    return { id: 'order-1', totalAmount: 100 } as any;
  }
}

function buildService() {
  const deliveryRepo = new FakeDeliveryDetailsRepository();
  const service = new OrderService(
    new FakeOrderDetailsRepository() as unknown as Repository<any>,
    {} as any, // orderItems
    deliveryRepo as unknown as Repository<DeliveryDetails>,
    {} as any, // user
    {} as any, // productVariant
    {} as any, // products
    {} as any, // shareCatalog
    {} as any, // shareCatalogProductStock
    {} as any, // outlets
    {} as any, // staff
    {} as any, // areaService
    {} as any, // outletStockService
  );
  return { service, deliveryRepo };
}

describe('delivery details write is idempotent per order', () => {
  const addressData = {
    flow_token: 'order-1',
    address: '2nd address',
    landmark: 'Near the temple',
    phone: '9999999999',
    name: 'Test',
  };

  it('updateOrderAddress: a second submission for the same order succeeds and overwrites', async () => {
    const { service, deliveryRepo } = buildService();

    const first = await service.updateOrderAddress({
      ...addressData,
      address: '1st address',
    });
    expect(first).not.toBeNull();

    const second = await service.updateOrderAddress(addressData);
    // Before the fix this returned null (constraint violation swallowed by
    // the catch), which stalled the WhatsApp flow.
    expect(second).not.toBeNull();
    expect(deliveryRepo.rows.get('order-1')!.address).toBe('2nd address');
  });

  it('confirmOrderWithAddress: re-confirming the same order does not throw', async () => {
    const { service, deliveryRepo } = buildService();
    const addr = {
      name: 'Test',
      address: 'addr',
      landmark: 'Near the temple',
      phone: '9999999999',
      wardId: null,
    };

    const first = await service.confirmOrderWithAddress('order-1', addr);
    const second = await service.confirmOrderWithAddress('order-1', addr);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(deliveryRepo.rows.size).toBe(1);
  });
});
