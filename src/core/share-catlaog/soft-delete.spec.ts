import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { CatlogService } from '../catlog/catlog.service';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatalogStatus } from 'src/common/enums';

/**
 * Soft-delete rules under test.
 *
 * Catalog: an ACTIVE/LIVE share catalog blocks the delete outright; the
 * remaining (INACTIVE/PAUSED) ones are hidden alongside the catalog so none can
 * later be toggled back On and push a deleted catalog live to customers.
 *
 * ShareCatalog: a LIVE catalog has its variants pulled before it is hidden.
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
  constructor(public rows: any[] = []) {}

  async find(options?: any) {
    return this.rows.filter((row) => matchesWhere(row, options?.where));
  }

  async findOne(options?: any) {
    return this.rows.find((row) => matchesWhere(row, options?.where)) ?? null;
  }

  /** `update(criteria, partial)` — criteria is an id string or a where object. */
  async update(criteria: any, partial: any) {
    const where = typeof criteria === 'string' ? { id: criteria } : criteria;
    const hit = this.rows.filter((row) => matchesWhere(row, where));
    hit.forEach((row) => Object.assign(row, partial));
    return { affected: hit.length };
  }

  async delete() {
    return { affected: 0 };
  }
}

function shareCatalogRow(overrides: Partial<any> = {}) {
  return {
    id: 'share-1',
    catalogId: 'cat-1',
    status: ShareCatalogStatus.INACTIVE,
    isDeleted: false,
    daysOfWeek: ['mon'],
    startTime: '10:00',
    endTime: '12:00',
    ShareCatalogProducts: [],
    ...overrides,
  };
}

describe('CatlogService.softDelete', () => {
  function makeService(shareCatalogRows: any[] = []) {
    const catalogRepo = new FakeRepo([
      { id: 'cat-1', name: 'Monday Greens', isDeleted: false },
    ]);
    const shareCatalogRepo = new FakeRepo(shareCatalogRows);
    const service = new CatlogService(
      catalogRepo as any,
      new FakeRepo() as any,
      new FakeRepo() as any,
      shareCatalogRepo as any,
    );
    return { service, catalogRepo, shareCatalogRepo };
  }

  it('hides a catalog that no share catalog references', async () => {
    const { service, catalogRepo } = makeService();

    await service.softDelete('cat-1');

    expect(catalogRepo.rows[0].isDeleted).toBe(true);
  });

  it.each([ShareCatalogStatus.ACTIVE, ShareCatalogStatus.LIVE])(
    'refuses to delete while a %s share catalog is selling it',
    async (status) => {
      const { service, catalogRepo } = makeService([
        shareCatalogRow({ status }),
      ]);

      await expect(service.softDelete('cat-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      // The catalog must survive a blocked attempt.
      expect(catalogRepo.rows[0].isDeleted).toBe(false);
    },
  );

  it('names the blocking share catalog and its schedule in the error', async () => {
    const { service } = makeService([
      shareCatalogRow({ status: ShareCatalogStatus.LIVE }),
    ]);

    await expect(service.softDelete('cat-1')).rejects.toThrow(
      'Cannot delete: share catalog "Monday Greens" (mon 10:00-12:00) is LIVE. ' +
        'Delete that share catalog first.',
    );
  });

  it.each([ShareCatalogStatus.INACTIVE, ShareCatalogStatus.PAUSED])(
    'cascades to a %s share catalog instead of blocking',
    async (status) => {
      const { service, catalogRepo, shareCatalogRepo } = makeService([
        shareCatalogRow({ status }),
      ]);

      await service.softDelete('cat-1');

      expect(catalogRepo.rows[0].isDeleted).toBe(true);
      expect(shareCatalogRepo.rows[0].isDeleted).toBe(true);
    },
  );

  it('leaves share catalogs belonging to other catalogs alone', async () => {
    const { service, shareCatalogRepo } = makeService([
      shareCatalogRow({ id: 'mine', catalogId: 'cat-1' }),
      shareCatalogRow({ id: 'theirs', catalogId: 'cat-2' }),
    ]);

    await service.softDelete('cat-1');

    expect(shareCatalogRepo.rows.find((r) => r.id === 'mine').isDeleted).toBe(
      true,
    );
    expect(shareCatalogRepo.rows.find((r) => r.id === 'theirs').isDeleted).toBe(
      false,
    );
  });

  it('404s on a catalog that is already deleted', async () => {
    const { service, catalogRepo } = makeService();
    catalogRepo.rows[0].isDeleted = true;

    await expect(service.softDelete('cat-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ShareCatlaogService.softDelete', () => {
  function makeService(rows: any[] = [shareCatalogRow()]) {
    const deactivatedVariantIds: string[] = [];
    /** Only the chain closeCatalog() uses to pull variants. */
    const variantRepositoryStub = {
      createQueryBuilder: () => ({
        update: () => ({
          set: () => ({
            whereInIds: (ids: string[]) => ({
              execute: async () => deactivatedVariantIds.push(...ids),
            }),
          }),
        }),
      }),
    } as any;

    const shareCatalogRepo = new FakeRepo(rows);
    const service = new ShareCatlaogService(
      shareCatalogRepo as any,
      new FakeRepo() as any,
      new FakeRepo() as any,
      new FakeRepo() as any,
      variantRepositoryStub,
      new FakeRepo() as any,
      new FakeRepo() as any,
    );
    return { service, shareCatalogRepo, deactivatedVariantIds };
  }

  it('hides the share catalog', async () => {
    const { service, shareCatalogRepo } = makeService();

    await service.softDelete('share-1');

    expect(shareCatalogRepo.rows[0].isDeleted).toBe(true);
  });

  it('pulls the variants of a LIVE catalog before hiding it', async () => {
    const { service, deactivatedVariantIds } = makeService([
      shareCatalogRow({
        status: ShareCatalogStatus.LIVE,
        ShareCatalogProducts: [
          { id: 'scp-1', variantId: 'var-1' },
          { id: 'scp-2', variantId: 'var-2' },
        ],
      }),
    ]);

    await service.softDelete('share-1');

    expect(deactivatedVariantIds).toEqual(['var-1', 'var-2']);
  });

  it('drops status to INACTIVE so a deleted row never reads as LIVE', async () => {
    const { service, shareCatalogRepo } = makeService([
      shareCatalogRow({ status: ShareCatalogStatus.LIVE }),
    ]);

    await service.softDelete('share-1');

    expect(shareCatalogRepo.rows[0].status).toBe(ShareCatalogStatus.INACTIVE);
  });

  it('404s on a share catalog that is already deleted', async () => {
    const { service } = makeService([shareCatalogRow({ isDeleted: true })]);

    await expect(service.softDelete('share-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
