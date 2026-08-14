import { Repository } from 'typeorm';
import { OrderService } from './order.service';
import { OrderDetails } from './entities/order.entity';
import { OrderStatus, PaymentMethod, PaymentStatus } from 'src/common/enums';

/**
 * Reproduces the production bug where a customer could re-tap a stale payment
 * button in WhatsApp after their order was already CONFIRMED (e.g. UPI paid +
 * admin-verified, then tapping "Cash on Delivery") and silently flip the
 * payment method / re-confirm the order.
 *
 * selectPaymentMethod must only act on a PENDING order — the single state in
 * which payment buttons are legitimately outstanding. Any other status
 * (CONFIRMED, CANCELLED, DISPATCHED, DELIVERED) is locked.
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

// No LIVE catalog → applyStockDeduction is a clean no-op for the happy path.
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
  );
  return { service, orderRepo };
}

describe('selectPaymentMethod only acts on a PENDING order', () => {
  it('selecting COD on a PENDING order confirms it', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.NOT_REQUIRED,
      paymentMethod: null,
      totalAmount: 100,
      stockDeducted: false,
      orderItems: [],
    });

    const result = await service.selectPaymentMethod('order-1', PaymentMethod.COD);

    expect(result.outcome).toBe('updated');
    expect(orderRepo.row!.status).toBe(OrderStatus.CONFIRMED);
    expect(orderRepo.row!.paymentMethod).toBe(PaymentMethod.COD);
  });

  it('locks a CONFIRMED order: re-tapping a payment button does not change it', async () => {
    // UPI already paid + admin-verified → CONFIRMED, then customer taps COD.
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.VERIFIED,
      paymentMethod: PaymentMethod.UPI,
      totalAmount: 100,
      stockDeducted: true,
    });

    const result = await service.selectPaymentMethod('order-1', PaymentMethod.COD);

    expect(result.outcome).toBe('locked');
    // Nothing about the order changed.
    expect(orderRepo.row!.status).toBe(OrderStatus.CONFIRMED);
    expect(orderRepo.row!.paymentMethod).toBe(PaymentMethod.UPI);
    expect(orderRepo.row!.paymentStatus).toBe(PaymentStatus.VERIFIED);
  });

  it('locks a PENDING order that already has UPI selected: tapping COD does not switch it', async () => {
    // Customer tapped UPI first → still PENDING, awaiting their screenshot.
    // A stale/second tap on COD must not silently switch the payment method.
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.AWAITING_SCREENSHOT,
      paymentMethod: PaymentMethod.UPI,
      totalAmount: 100,
      stockDeducted: false,
    });

    const result = await service.selectPaymentMethod('order-1', PaymentMethod.COD);

    expect(result.outcome).toBe('locked');
    expect(orderRepo.row!.status).toBe(OrderStatus.PENDING);
    expect(orderRepo.row!.paymentMethod).toBe(PaymentMethod.UPI);
    expect(orderRepo.row!.paymentStatus).toBe(PaymentStatus.AWAITING_SCREENSHOT);
  });

  it('locks a PENDING order that already has UPI selected: re-tapping UPI again does not re-run it', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.AWAITING_SCREENSHOT,
      paymentMethod: PaymentMethod.UPI,
      totalAmount: 100,
      stockDeducted: false,
    });

    const result = await service.selectPaymentMethod('order-1', PaymentMethod.UPI);

    expect(result.outcome).toBe('locked');
    expect(orderRepo.row!.paymentMethod).toBe(PaymentMethod.UPI);
  });

  it('locks a CANCELLED order: a stale button tap cannot revive it', async () => {
    const { service, orderRepo } = buildService({
      id: 'order-1',
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.NOT_REQUIRED,
      paymentMethod: null,
      totalAmount: 100,
      stockDeducted: false,
    });

    const result = await service.selectPaymentMethod('order-1', PaymentMethod.COD);

    expect(result.outcome).toBe('locked');
    expect(orderRepo.row!.status).toBe(OrderStatus.CANCELLED);
    expect(orderRepo.row!.paymentMethod).toBeNull();
  });

  it('returns not_found for an unknown order', async () => {
    const { service } = buildService(null);

    const result = await service.selectPaymentMethod('nope', PaymentMethod.COD);

    expect(result.outcome).toBe('not_found');
  });
});
