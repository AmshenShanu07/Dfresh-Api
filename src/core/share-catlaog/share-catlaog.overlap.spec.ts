import { ConflictException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { ShareCatlaogService } from './share-catlaog.service';
import { ProductUnits, ShareCatalogStatus } from 'src/common/enums';

/**
 * Schedule-slot rules under test: only ACTIVE/LIVE catalogs reserve a time
 * window. INACTIVE and PAUSED ones release it, and a PAUSED catalog that is
 * topped up re-checks the slot before resuming.
 *
 * Time is frozen at Mon 2026-08-10 09:30 IST so a `mon 10:00-12:00` schedule is
 * deterministically *outside* its current window.
 */

/** Matches a TypeORM `where` object, honouring In(...) operators. */
function matchesWhere(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond instanceof FindOperator) {
      return (cond.value as any[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

/** In-memory stand-in for a TypeORM repository; rows are shared by reference. */
class FakeRepo {
  private seq = 0;

  constructor(public rows: any[] = []) {}

  create(data: any) {
    return { ...data };
  }

  async save(data: any) {
    const rows = Array.isArray(data) ? data : [data];
    const stored = rows.map((row) => {
      const existing = row.id && this.rows.find((r) => r.id === row.id);
      if (existing) {
        Object.assign(existing, row);
        return existing;
      }
      const created = { id: row.id ?? `generated-${++this.seq}`, ...row };
      this.rows.push(created);
      return created;
    });
    return Array.isArray(data) ? stored : stored[0];
  }

  async find(options?: any) {
    return this.rows.filter((row) => matchesWhere(row, options?.where));
  }

  async findOne(options?: any) {
    return this.rows.find((row) => matchesWhere(row, options?.where)) ?? null;
  }

  async delete() {
    return { affected: 0 };
  }
}

/** Only the chain `resumeIfSellable` uses when it promotes a catalog to LIVE. */
const variantRepositoryStub = {
  createQueryBuilder: () => ({
    update: () => ({
      set: () => ({
        whereInIds: () => ({ execute: async () => undefined }),
      }),
    }),
  }),
} as any;

/**
 * These tests are about schedule overlap, not catalog validity — treat every
 * catalogId they pass as an existing, non-deleted catalog.
 */
const catalogRepositoryStub = {
  findOne: async (options?: any) => ({ id: options?.where?.id }),
} as any;

function makeService(catalogRows: any[] = []) {
  const catalogRepo = new FakeRepo(catalogRows);
  const productsRepo = new FakeRepo();
  const stockRepo = new FakeRepo();
  const service = new ShareCatlaogService(
    catalogRepo as any,
    productsRepo as any,
    stockRepo as any,
    new FakeRepo() as any,
    variantRepositoryStub,
    new FakeRepo() as any,
    catalogRepositoryStub,
  );
  return { service, catalogRepo, stockRepo };
}

/** A stored catalog scheduled mon 10:00-12:00 unless overridden. */
function catalogRow(overrides: Partial<any> = {}) {
  return {
    id: 'existing-1',
    catalogId: 'cat-1',
    isDeleted: false,
    status: ShareCatalogStatus.ACTIVE,
    daysOfWeek: ['mon'],
    startTime: '10:00',
    endTime: '12:00',
    lastWindowOpenedAt: null,
    catalog: { name: 'Monday Greens' },
    ShareCatalogProducts: [],
    ShareCatalogProductStock: [],
    ...overrides,
  };
}

const createDto = {
  catalogId: 'cat-2',
  daysOfWeek: ['mon'],
  startTime: '10:00',
  endTime: '12:00',
  shareCatalogProducts: [],
  productQuantities: [],
} as any;

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-10T04:00:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('create - which statuses reserve a slot', () => {
  it('allows an overlapping window when the other catalog is PAUSED', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.PAUSED }),
    ]);

    await expect(service.create(createDto)).resolves.toBeDefined();
  });

  it('allows an overlapping window when the other catalog is INACTIVE', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.INACTIVE }),
    ]);

    await expect(service.create(createDto)).resolves.toBeDefined();
  });

  it('rejects an overlapping window when the other catalog is ACTIVE', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.ACTIVE }),
    ]);

    await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    await expect(service.create(createDto)).rejects.toThrow(
      /Schedule overlaps "Monday Greens" \(mon 10:00-12:00\)/,
    );
  });

  it('rejects an overlapping window when the other catalog is LIVE', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.LIVE }),
    ]);

    await expect(service.create(createDto)).rejects.toThrow(ConflictException);
  });

  it('allows a non-overlapping window against an ACTIVE catalog', async () => {
    const { service } = makeService([catalogRow()]);

    await expect(
      service.create({ ...createDto, startTime: '12:00', endTime: '14:00' }),
    ).resolves.toBeDefined();
  });
});

describe('update - schedule edits are validated for every status', () => {
  it('rejects a switched-off catalog being moved onto a LIVE window', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.LIVE }),
      catalogRow({
        id: 'off-1',
        status: ShareCatalogStatus.INACTIVE,
        daysOfWeek: ['tue'],
        catalog: { name: 'Parked' },
      }),
    ]);

    await expect(
      service.update('off-1', { daysOfWeek: ['mon'] } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a PAUSED catalog being moved onto a LIVE window', async () => {
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.LIVE }),
      catalogRow({
        id: 'paused-1',
        status: ShareCatalogStatus.PAUSED,
        daysOfWeek: ['tue'],
        catalog: { name: 'Sold out' },
      }),
    ]);

    await expect(
      service.update('paused-1', { daysOfWeek: ['mon'] } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('does not re-check the slot when no schedule field is supplied', async () => {
    // Both sit on mon 10:00-12:00 — legal, because the second one is PAUSED.
    const { service } = makeService([
      catalogRow({ status: ShareCatalogStatus.LIVE }),
      catalogRow({
        id: 'paused-1',
        status: ShareCatalogStatus.PAUSED,
        catalog: { name: 'Sold out' },
      }),
    ]);

    await expect(
      service.update('paused-1', { catalogId: 'cat-9' } as any),
    ).resolves.toBeDefined();
  });
});

describe('resume after top-up - re-checks the released slot', () => {
  /** A PAUSED catalog on mon 10:00-12:00 with one sold-out 500g product. */
  function pausedSetup(otherCatalogs: any[]) {
    const stockRow = {
      id: 'stock-1',
      shareCatalogId: 'paused-1',
      productId: 'prod-1',
      offeredGrams: 1000,
      remainingGrams: 0,
    };
    const paused = catalogRow({
      id: 'paused-1',
      status: ShareCatalogStatus.PAUSED,
      catalog: { name: 'Sold out' },
      ShareCatalogProducts: [
        { productId: 'prod-1', variantId: 'var-1', variant: { weight: 500 } },
      ],
      ShareCatalogProductStock: [stockRow],
    });
    const made = makeService([...otherCatalogs, paused]);
    made.stockRepo.rows.push(stockRow);
    return { ...made, paused };
  }

  const topUp = {
    productQuantities: [
      { productId: 'prod-1', addQnty: 1000, qntyUnit: ProductUnits.G },
    ],
  } as any;

  it('stays PAUSED when another catalog has taken the window', async () => {
    const { service, paused } = pausedSetup([
      catalogRow({ id: 'taker-1', status: ShareCatalogStatus.ACTIVE }),
    ]);

    await service.update('paused-1', topUp);

    expect(paused.status).toBe(ShareCatalogStatus.PAUSED);
    // The top-up is still applied, so a later resume can succeed.
    expect(paused.ShareCatalogProductStock[0].remainingGrams).toBe(1000);
  });

  it('resumes to ACTIVE when the window is free and currently closed', async () => {
    const { service, paused } = pausedSetup([]);

    await service.update('paused-1', topUp);

    expect(paused.status).toBe(ShareCatalogStatus.ACTIVE);
  });

  it('ignores an INACTIVE catalog sharing the window and resumes', async () => {
    const { service, paused } = pausedSetup([
      catalogRow({ id: 'off-1', status: ShareCatalogStatus.INACTIVE }),
    ]);

    await service.update('paused-1', topUp);

    expect(paused.status).toBe(ShareCatalogStatus.ACTIVE);
  });
});
