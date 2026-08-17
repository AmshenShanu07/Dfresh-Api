import { Repository } from 'typeorm';
import { OrderService } from './order.service';
import { OrderDetails } from './entities/order.entity';
import { OrderStatus } from 'src/common/enums';

/**
 * The Dispatched Orders page lists DISPATCHED and DELIVERED orders together,
 * DISPATCHED first. findAll() must therefore accept a comma-separated status
 * list (matching either status via `In`) and, only in that multi-status case,
 * sort by status first so DISPATCHED rows aren't interleaved with DELIVERED
 * ones — Postgres orders a native enum column by its declared value order
 * (DISPATCHED precedes DELIVERED in OrderStatus), not alphabetically, so a
 * plain `status ASC` is sufficient once the query reaches Postgres. This spec
 * checks the query OrderService *builds*, not Postgres's own enum ordering.
 */
class RecordingOrderDetailsRepository {
  lastFindArgs: any;
  lastCountArgs: any;

  async find(args: any) {
    this.lastFindArgs = args;
    return [];
  }

  async count(args: any) {
    this.lastCountArgs = args;
    return 0;
  }
}

function buildService(orderRepo: RecordingOrderDetailsRepository) {
  return new OrderService(
    orderRepo as unknown as Repository<OrderDetails>,
    {} as any, // orderItems
    {} as any, // deliveryDetails
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
}

describe('findAll status filter', () => {
  it('a single status filters on it and sorts by createdAt only', async () => {
    const orderRepo = new RecordingOrderDetailsRepository();
    const service = buildService(orderRepo);

    await service.findAll({ status: 'CONFIRMED' });

    expect(orderRepo.lastFindArgs.where.status).toBe(OrderStatus.CONFIRMED);
    expect(orderRepo.lastFindArgs.order).toEqual({ createdAt: 'DESC' });
  });

  it('a comma-separated status list matches any of them and sorts by status first', async () => {
    const orderRepo = new RecordingOrderDetailsRepository();
    const service = buildService(orderRepo);

    await service.findAll({ status: 'DISPATCHED,DELIVERED' });

    expect(orderRepo.lastFindArgs.where.status.type).toBe('in');
    expect(orderRepo.lastFindArgs.where.status.value).toEqual([
      'DISPATCHED',
      'DELIVERED',
    ]);
    expect(orderRepo.lastFindArgs.order).toEqual({
      status: 'ASC',
      createdAt: 'DESC',
    });
    // count() must see the identical where clause so `total` matches the rows.
    expect(orderRepo.lastCountArgs.where).toEqual(orderRepo.lastFindArgs.where);
  });

  it('no status filter leaves every order in, sorted by createdAt only', async () => {
    const orderRepo = new RecordingOrderDetailsRepository();
    const service = buildService(orderRepo);

    await service.findAll({});

    expect(orderRepo.lastFindArgs.where.status).toBeUndefined();
    expect(orderRepo.lastFindArgs.order).toEqual({ createdAt: 'DESC' });
  });
});
