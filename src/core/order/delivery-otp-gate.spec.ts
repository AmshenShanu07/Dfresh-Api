import { Repository } from 'typeorm';
import { OrderService } from './order.service';
import { OrderDetails } from './entities/order.entity';
import { OrderStatus, UserTypes } from 'src/common/enums';

/**
 * The Confirmed Orders page now explicitly dispatches an order (assigning a
 * delivery agent) before the agent can hand it off. The delivery-OTP
 * send/verify actions must therefore require DISPATCHED, not CONFIRMED —
 * confirming an order alone should no longer let an agent skip straight to
 * DELIVERED.
 */
class FakeOrderDetailsRepository {
  row: Partial<OrderDetails> | null;

  constructor(row: Partial<OrderDetails> | null) {
    this.row = row;
  }

  async findOne(_opts: any) {
    return this.row ? { ...this.row } : null;
  }

  async update(_id: string, patch: Partial<OrderDetails>) {
    if (this.row) Object.assign(this.row, patch);
    return { affected: 1 } as any;
  }
}

class FakeShareCatalogRepository {
  async findOne() {
    return null;
  }
  async update() {
    return { affected: 0 } as any;
  }
}

function buildService(row: Partial<OrderDetails> | null) {
  const orderRepo = new FakeOrderDetailsRepository(row);
  const service = new OrderService(
    orderRepo as unknown as Repository<OrderDetails>,
    {} as any, // orderItems
    {} as any, // deliveryDetails
    {} as any, // user
    {} as any, // productVariant
    {} as any, // products
    new FakeShareCatalogRepository() as any, // shareCatalog
    {} as any, // shareCatalogProductStock
    {} as any, // outlets
    {} as any, // staff
    {} as any, // areaService
    {} as any, // outletStockService
  );
  return { service, orderRepo };
}

const admin = { id: 'admin-1', userType: UserTypes.ADMIN };
const agent = { id: 'agent-1', userType: UserTypes.OUTLET_AGENT };
const otherAgent = { id: 'agent-2', userType: UserTypes.OUTLET_AGENT };

describe('delivery OTP actions require DISPATCHED', () => {
  it('rejects sending the OTP while the order is only CONFIRMED', async () => {
    const { service } = buildService({
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    await expect(
      service.getOrderForDeliveryOtp('order-1', admin),
    ).rejects.toThrow('Order must be DISPATCHED to send or verify a delivery OTP');
  });

  it('rejects verifying the OTP while the order is only CONFIRMED', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    await expect(
      service.verifyDeliveryOtp('order-1', admin, '123456'),
    ).rejects.toThrow('Order must be DISPATCHED to send or verify a delivery OTP');
    // The order must not have silently moved to DELIVERED.
    expect(orderRepo.row!.status).toBe(OrderStatus.CONFIRMED);
  });

  it('allows sending the OTP once the order is DISPATCHED', async () => {
    const { service } = buildService({
      id: 'order-1',
      status: OrderStatus.DISPATCHED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    const order = await service.getOrderForDeliveryOtp('order-1', admin);
    expect(order.status).toBe(OrderStatus.DISPATCHED);
  });

  it('the assigned agent can verify a correct OTP on a DISPATCHED order and it moves to DELIVERED', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.DISPATCHED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    const result = await service.verifyDeliveryOtp('order-1', agent, '123456');

    expect(result.success).toBe(true);
    expect(orderRepo.row!.status).toBe(OrderStatus.DELIVERED);
    expect(orderRepo.row!.deliveredAt).toBeInstanceOf(Date);
  });

  it('rejects an incorrect OTP on a DISPATCHED order without changing status', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.DISPATCHED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    const result = await service.verifyDeliveryOtp('order-1', agent, '000000');

    expect(result.success).toBe(false);
    expect(orderRepo.row!.status).toBe(OrderStatus.DISPATCHED);
  });

  it('rejects an agent who is not assigned to this DISPATCHED order', async () => {
    const { service } = buildService({
      id: 'order-1',
      status: OrderStatus.DISPATCHED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    await expect(
      service.verifyDeliveryOtp('order-1', otherAgent, '123456'),
    ).rejects.toThrow('You are not the delivery agent assigned to this order');
  });

  it('rejects OTP actions on an already-DELIVERED order', async () => {
    const { service } = buildService({
      id: 'order-1',
      status: OrderStatus.DELIVERED,
      deliveryAgentId: agent.id,
      deliveryOtp: '123456',
    });

    await expect(
      service.getOrderForDeliveryOtp('order-1', admin),
    ).rejects.toThrow('Order must be DISPATCHED to send or verify a delivery OTP');
  });
});
