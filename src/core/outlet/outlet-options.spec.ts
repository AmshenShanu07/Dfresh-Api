import { OutletService } from './outlet.service';
import {
  OutletOptionsSortBy,
  OutletOptionsSortOrder,
} from './dto/outlet-options.dto';

/**
 * GET /outlet/options feeds outlet dropdowns (purchase, staff). It must never
 * return deleted outlets, filter by status only when asked, and list the most
 * recently created outlet first by default.
 */
function buildService() {
  const calls: any[] = [];
  const repo = {
    async find(options: any) {
      calls.push(options);
      return [];
    },
  };
  const service = new OutletService(
    repo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, calls };
}

describe('OutletService.findOptions', () => {
  it('excludes deleted outlets and sorts newest first by default', async () => {
    const { service, calls } = buildService();

    await service.findOptions({});

    expect(calls[0].where).toEqual({ isDeleted: false });
    expect(calls[0].order).toEqual({ createdAt: 'DESC', id: 'DESC' });
  });

  it.each([true, false])(
    'filters by isActive = %s when given',
    async (flag) => {
      const { service, calls } = buildService();

      await service.findOptions({ isActive: flag });

      expect(calls[0].where).toEqual({ isDeleted: false, isActive: flag });
    },
  );

  it('honours an explicit sort field and order', async () => {
    const { service, calls } = buildService();

    await service.findOptions({
      sortBy: OutletOptionsSortBy.name,
      sortOrder: OutletOptionsSortOrder.ASC,
    });

    expect(calls[0].order).toEqual({ name: 'ASC', id: 'ASC' });
  });
});
