import { BadRequestException } from '@nestjs/common';
import { ManualOrderService } from './manual-order.service';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { OrderStatus, PaymentMethod, PaymentStatus, UserTypes } from 'src/common/enums';

/**
 * A fake EntityManager good enough for the create path: it records every row
 * saved, keyed by entity class, and hands back rows with generated ids.
 */
class FakeEntityManager {
  saved: Map<any, any[]> = new Map();
  existingUser: any = null;
  private seq = 0;

  constructor(existingUser: any = null) {
    this.existingUser = existingUser;
  }

  create(_entity: any, data: any) {
    return { ...data };
  }

  async findOne(entity: any, _options: any) {
    if (entity === User) return this.existingUser;
    return null;
  }

  async save(entity: any, data?: any) {
    // save(Entity, data) and save(Entity, data[]) forms are both used.
    const rows = Array.isArray(data) ? data : [data];
    const stored = rows.map((row) => ({
      id: row.id ?? `generated-${++this.seq}`,
      ...row,
    }));
    const existing = this.saved.get(entity) ?? [];
    this.saved.set(entity, [...existing, ...stored]);
    return Array.isArray(data) ? stored : stored[0];
  }

  rowsFor(entity: any) {
    return this.saved.get(entity) ?? [];
  }
}

class FakeDataSource {
  manager: FakeEntityManager;

  constructor(manager: FakeEntityManager) {
    this.manager = manager;
  }

  async transaction(cb: (m: FakeEntityManager) => Promise<any>) {
    return cb(this.manager);
  }
}

const variantRow = {
  id: '11111111-1111-1111-1111-111111111111',
  productId: 'product-1',
  cleaningCharge: 20,
  isDeleted: false,
  cuttingStyles: [
    { cuttingStyleId: 'style-curry', price: 15, isDeleted: false },
  ],
};

class FakeVariantRepository {
  rows: any[];
  constructor(rows: any[]) {
    this.rows = rows;
  }
  async find() {
    return this.rows;
  }
}

class FakeWardRepository {
  row: any;
  constructor(row: any) {
    this.row = row;
  }
  async findOne() {
    return this.row;
  }
}

class FakeAreaService {
  area: any;
  constructor(area: any = null) {
    this.area = area;
  }
  async findOneActive(id: string) {
    return this.area && this.area.id === id ? this.area : null;
  }
}

class FakeOrderService {
  deducted: string[] = [];
  constructor(private outlets: any[] = []) {}
  async findSellingOutletsForWard() {
    return this.outlets;
  }
  async applyStockDeduction(orderId: string) {
    this.deducted.push(orderId);
  }
  async findOne(id: string) {
    return { id };
  }
}

function buildService({
  existingUser = null,
  variants = [variantRow],
  ward = { id: '22222222-2222-2222-2222-222222222222' },
  area = null,
  outlets = [],
  outletStock = {},
}: {
  existingUser?: any;
  variants?: any[];
  ward?: any;
  area?: any;
  outlets?: any[];
  outletStock?: Record<string, number>;
} = {}) {
  const manager = new FakeEntityManager(existingUser);
  const dataSource = new FakeDataSource(manager);
  const orderService = new FakeOrderService(outlets);
  const service = new ManualOrderService(
    dataSource as any,
    {} as any, // userRepository — creation goes through the transaction manager
    new FakeVariantRepository(variants) as any,
    {} as any, // productRepository
    {} as any, // shareCatalogProductsRepository
    new FakeWardRepository(ward) as any,
    new FakeAreaService(area) as any,
    orderService as any,
    {
      async getStockMap() {
        return new Map(Object.entries(outletStock));
      },
    } as any, // outletStockService
  );
  return { service, manager, orderService };
}

const baseDto = () => ({
  phone: '9876543210',
  customerName: 'Priya',
  items: [
    {
      variantId: '11111111-1111-1111-1111-111111111111',
      quantity: 2,
      price: 100,
      cleaning: true,
    },
  ],
  wardId: '22222222-2222-2222-2222-222222222222',
  deliveryName: 'Priya',
  deliveryPhone: '9876543210',
  address: '12 Marine Drive',
  pinCode: '682031',
  paymentMethod: PaymentMethod.COD,
});

describe('ManualOrderService.create', () => {
  it('creates the customer with the normalised wa_id phone', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [user] = manager.rowsFor(User);
    expect(user.phone).toBe('919876543210');
    expect(user.name).toBe('Priya');
    expect(user.userType).toBe(UserTypes.CUSTOMER);
  });

  it('reuses an existing customer instead of creating a second row', async () => {
    const { service, manager } = buildService({
      existingUser: { id: 'user-9', phone: '919876543210', userType: UserTypes.CUSTOMER },
    });

    await service.create(baseDto() as any);

    expect(manager.rowsFor(User)).toHaveLength(0);
    const [order] = manager.rowsFor(OrderDetails);
    expect(order.userId).toBe('user-9');
  });

  it('rejects a new customer with no name', async () => {
    const { service } = buildService();
    const dto = { ...baseDto(), customerName: undefined };

    await expect(service.create(dto as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lands the order CONFIRMED with the total including charges', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.totalAmount).toBe(240); // (100 + 20 cleaning) * 2
    expect(order.wardId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('maps COD to a payment status of NOT_REQUIRED', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(order.paymentMethod).toBe(PaymentMethod.COD);
    expect(order.paymentStatus).toBe(PaymentStatus.NOT_REQUIRED);
  });

  it('maps UPI to VERIFIED — staff only record it once the money has landed', async () => {
    const { service, manager } = buildService();

    await service.create({ ...baseDto(), paymentMethod: PaymentMethod.UPI } as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(order.paymentStatus).toBe(PaymentStatus.VERIFIED);
  });

  it('snapshots charges onto the order item', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [item] = manager.rowsFor(OrderItems);
    expect(item.cleaning).toBe(true);
    expect(item.cleaningCharge).toBe(20);
    expect(item.price).toBe(100);
    expect(item.totalPrice).toBe(240);
    expect(item.productId).toBe('product-1');
  });

  it('writes the delivery details', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [delivery] = manager.rowsFor(DeliveryDetails);
    expect(delivery.address).toBe('12 Marine Drive');
    expect(delivery.pinCode).toBe('682031');
    expect(delivery.name).toBe('Priya');
  });

  it('auto-assigns the delivery agent from the selected area', async () => {
    const areaId = '33333333-3333-3333-3333-333333333333';
    const { service, manager } = buildService({
      area: {
        id: areaId,
        wardId: '22222222-2222-2222-2222-222222222222',
        userId: 'agent-7',
      },
    });

    await service.create({ ...baseDto(), areaId } as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(order.areaId).toBe(areaId);
    expect(order.deliveryAgentId).toBe('agent-7');
  });

  it('leaves areaId and deliveryAgentId null when the ward has no areas', async () => {
    const { service, manager } = buildService();

    await service.create(baseDto() as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(order.areaId).toBeNull();
    expect(order.deliveryAgentId).toBeNull();
  });

  it('rejects an area that belongs to a different ward', async () => {
    const areaId = '33333333-3333-3333-3333-333333333333';
    const { service } = buildService({
      area: { id: areaId, wardId: 'some-other-ward', userId: 'agent-7' },
    });

    await expect(
      service.create({ ...baseDto(), areaId } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown ward', async () => {
    const { service } = buildService({ ward: null });

    await expect(service.create(baseDto() as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an unknown or deleted variant', async () => {
    const { service } = buildService({ variants: [] });

    await expect(service.create(baseDto() as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deducts stock after the transaction commits', async () => {
    const { service, manager, orderService } = buildService();

    await service.create(baseDto() as any);

    const [order] = manager.rowsFor(OrderDetails);
    expect(orderService.deducted).toEqual([order.id]);
  });
});

describe('ManualOrderService.create — fulfilling outlet', () => {
  const outletA = {
    id: '33333333-3333-3333-3333-33333333333a',
    name: 'Outlet A',
  };
  const outletB = {
    id: '33333333-3333-3333-3333-33333333333b',
    name: 'Outlet B',
  };
  // variantRow has no weight in the shared fixture; give it 1 kg.
  const variants = [
    { ...variantRow, weight: 1000, product: { name: { en: 'Pearl Spot' } } },
  ];

  it("uses the ward's only selling outlet without asking", async () => {
    const { service, manager } = buildService({
      variants,
      outlets: [outletA],
      outletStock: { 'product-1': 5000 },
    });

    await service.create(baseDto() as any);

    expect(manager.rowsFor(OrderDetails)[0].outletId).toBe(outletA.id);
  });

  it('requires a choice when the ward has several selling outlets', async () => {
    const { service } = buildService({ variants, outlets: [outletA, outletB] });

    await expect(service.create(baseDto() as any)).rejects.toThrow(
      'more than one outlet',
    );
  });

  it('records the chosen outlet in a multi-outlet ward', async () => {
    const { service, manager } = buildService({
      variants,
      outlets: [outletA, outletB],
      outletStock: { 'product-1': 5000 },
    });

    await service.create({ ...baseDto(), outletId: outletB.id } as any);

    expect(manager.rowsFor(OrderDetails)[0].outletId).toBe(outletB.id);
  });

  it('rejects an order the outlet cannot cover and names the product', async () => {
    // 2 × 1 kg against 1.5 kg at the outlet.
    const { service } = buildService({
      variants,
      outlets: [outletA],
      outletStock: { 'product-1': 1500 },
    });

    await expect(service.create(baseDto() as any)).rejects.toThrow(
      'Out of stock at the selected outlet: Pearl Spot.',
    );
  });

  it('rejects an area owned by a different outlet', async () => {
    const { service } = buildService({
      variants,
      outlets: [outletA, outletB],
      outletStock: { 'product-1': 5000 },
      area: {
        id: '44444444-4444-4444-4444-444444444444',
        wardId: '22222222-2222-2222-2222-222222222222',
        outletId: outletA.id,
        userId: 'agent-a',
      },
    });

    await expect(
      service.create({
        ...baseDto(),
        outletId: outletB.id,
        areaId: '44444444-4444-4444-4444-444444444444',
      } as any),
    ).rejects.toThrow('Select an area served by the chosen outlet.');
  });
});
