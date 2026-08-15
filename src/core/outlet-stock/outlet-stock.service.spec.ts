import { BadRequestException } from '@nestjs/common';
import { OutletStockService } from './outlet-stock.service';
import { OutletProductStock } from './entities/outlet-product-stock.entity';
import { StockTransfer } from './entities/stock-transfer.entity';
import { MeasurementType, ProductUnits } from 'src/common/enums';

/** In-memory stand-in for a TypeORM repository; rows are shared by reference. */
class FakeRepo {
  constructor(public rows: any[] = []) {}

  async find(options?: any) {
    if (!options?.where) return this.rows;
    return this.rows.filter((row) =>
      Object.entries(options.where).every(([k, v]) => row[k] === v),
    );
  }

  async findOne(options?: any) {
    return (
      this.rows.find((row) =>
        Object.entries(options?.where ?? {}).every(([k, v]) => row[k] === v),
      ) ?? null
    );
  }

  async save(data: any) {
    const existingIndex = this.rows.findIndex(
      (row) => data.id && row.id === data.id,
    );
    const stored = { id: data.id ?? `generated-${this.rows.length + 1}`, ...data };
    if (existingIndex >= 0) {
      this.rows[existingIndex] = stored;
    } else {
      this.rows.push(stored);
    }
    return stored;
  }
}

/** Fake DataSource.transaction — mirrors manual-order-create.spec.ts's FakeEntityManager. */
class FakeEntityManager {
  constructor(private readonly reposByEntity: Map<any, FakeRepo>) {}

  private repoFor(entity: any): FakeRepo {
    const repo = this.reposByEntity.get(entity);
    if (!repo) throw new Error('no fake repo registered for entity');
    return repo;
  }

  async findOne(entity: any, options: any) {
    return this.repoFor(entity).findOne(options);
  }

  async save(entity: any, data: any) {
    return this.repoFor(entity).save(data);
  }
}

class FakeDataSource {
  constructor(private readonly manager: FakeEntityManager) {}
  async transaction(cb: (m: FakeEntityManager) => Promise<any>) {
    return cb(this.manager);
  }
}

function buildService({
  outletProductStocks = [],
  outlets = [],
  products = [],
}: {
  outletProductStocks?: any[];
  outlets?: any[];
  products?: any[];
} = {}) {
  const outletProductStockRepo = new FakeRepo(outletProductStocks);
  const stockTransferRepo = new FakeRepo([]);
  const outletRepo = new FakeRepo(outlets);
  const productRepo = new FakeRepo(products);

  const manager = new FakeEntityManager(
    new Map<any, FakeRepo>([
      [OutletProductStock, outletProductStockRepo],
      [StockTransfer, stockTransferRepo],
    ]),
  );
  const dataSource = new FakeDataSource(manager);

  const service = new OutletStockService(
    dataSource as any,
    outletProductStockRepo as any,
    stockTransferRepo as any,
    productRepo as any,
    outletRepo as any,
  );

  return { service, outletProductStockRepo, stockTransferRepo };
}

describe('OutletStockService.applyPurchaseIn', () => {
  it('creates a new stock row when the outlet has never held this product', async () => {
    const { service, outletProductStockRepo } = buildService();

    await service.applyPurchaseIn('outlet-1', 'product-1', 5000);

    expect(outletProductStockRepo.rows).toEqual([
      expect.objectContaining({
        outletId: 'outlet-1',
        productId: 'product-1',
        quantity: 5000,
      }),
    ]);
  });

  it('increments an existing stock row', async () => {
    const { service, outletProductStockRepo } = buildService({
      outletProductStocks: [
        { id: 'row-1', outletId: 'outlet-1', productId: 'product-1', quantity: 2000 },
      ],
    });

    await service.applyPurchaseIn('outlet-1', 'product-1', 5000);

    expect(outletProductStockRepo.rows[0].quantity).toBe(7000);
  });
});

describe('OutletStockService.applyOrderConsumption', () => {
  it('decrements stock below zero when the outlet oversells (no floor)', async () => {
    const { service, outletProductStockRepo } = buildService({
      outletProductStocks: [
        { id: 'row-1', outletId: 'outlet-1', productId: 'product-1', quantity: 300 },
      ],
    });

    await service.applyOrderConsumption('outlet-1', 'product-1', 500);

    expect(outletProductStockRepo.rows[0].quantity).toBe(-200);
  });
});

describe('OutletStockService.restoreOrderConsumption', () => {
  it('credits a negative balance back up', async () => {
    const { service, outletProductStockRepo } = buildService({
      outletProductStocks: [
        { id: 'row-1', outletId: 'outlet-1', productId: 'product-1', quantity: -200 },
      ],
    });

    await service.restoreOrderConsumption('outlet-1', 'product-1', 500);

    expect(outletProductStockRepo.rows[0].quantity).toBe(300);
  });
});

describe('OutletStockService.transfer', () => {
  const dto = {
    productId: 'product-1',
    fromOutletId: 'outlet-a',
    toOutletId: 'outlet-b',
    quantity: 2,
    quantityUnit: ProductUnits.KG,
  };

  it('moves base-unit quantity from source to destination and logs it', async () => {
    const { service, outletProductStockRepo, stockTransferRepo } = buildService({
      outletProductStocks: [
        { id: 'row-a', outletId: 'outlet-a', productId: 'product-1', quantity: 5000 },
      ],
    });

    const result = await service.transfer(dto, 'admin-1');

    const sourceRow = outletProductStockRepo.rows.find(
      (r) => r.outletId === 'outlet-a',
    );
    const destRow = outletProductStockRepo.rows.find(
      (r) => r.outletId === 'outlet-b',
    );
    expect(sourceRow.quantity).toBe(3000);
    expect(destRow.quantity).toBe(2000);
    expect(stockTransferRepo.rows).toHaveLength(1);
    expect(result).toEqual(
      expect.objectContaining({
        productId: 'product-1',
        fromOutletId: 'outlet-a',
        toOutletId: 'outlet-b',
        quantity: 2,
        quantityUnit: ProductUnits.KG,
        movedByUserId: 'admin-1',
      }),
    );
  });

  it('blocks the transfer when the source outlet does not have enough stock', async () => {
    const { service, outletProductStockRepo, stockTransferRepo } = buildService({
      outletProductStocks: [
        { id: 'row-a', outletId: 'outlet-a', productId: 'product-1', quantity: 1000 },
      ],
    });

    await expect(service.transfer(dto, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );

    expect(outletProductStockRepo.rows[0].quantity).toBe(1000);
    expect(stockTransferRepo.rows).toHaveLength(0);
  });

  it('blocks a transfer with no source stock at all (no row ever created)', async () => {
    const { service, stockTransferRepo } = buildService();

    await expect(service.transfer(dto, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(stockTransferRepo.rows).toHaveLength(0);
  });

  it('blocks transferring an outlet to itself', async () => {
    const { service } = buildService({
      outletProductStocks: [
        { id: 'row-a', outletId: 'outlet-a', productId: 'product-1', quantity: 5000 },
      ],
    });

    await expect(
      service.transfer({ ...dto, toOutletId: 'outlet-a' }, 'admin-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OutletStockService.getGrid', () => {
  it('defaults an outlet/product pair with no stock row to zero', async () => {
    const { service } = buildService({
      outlets: [
        { id: 'outlet-1', name: 'Kaloor', isDeleted: false },
        { id: 'outlet-2', name: 'Edapally', isDeleted: false },
      ],
      products: [
        {
          id: 'product-1',
          name: { en: 'Chicken', ml: 'Chicken' },
          measurementType: MeasurementType.WEIGHT,
          isDeleted: false,
        },
      ],
      outletProductStocks: [
        { outletId: 'outlet-1', productId: 'product-1', quantity: 5000 },
      ],
    });

    const grid = await service.getGrid();

    expect(grid.outlets).toEqual([
      { id: 'outlet-1', name: 'Kaloor' },
      { id: 'outlet-2', name: 'Edapally' },
    ]);
    const product = grid.products[0];
    expect(product.stocks).toEqual([
      { outletId: 'outlet-1', quantity: 5000, formatted: '5 kg' },
      { outletId: 'outlet-2', quantity: 0, formatted: '0 g' },
    ]);
  });
});
