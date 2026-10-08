import { UsersService } from './users.service';
import { UserTypes } from 'src/common/enums';

/**
 * Soft-deleting an outlet flags its Staff rows `isDeleted: true`. An agent
 * later moved to another outlet kept that flag, because the edit path only
 * rewrote `outletId` — so the delivery-agent list (which filters
 * `isDeleted: false`) silently dropped them from their new outlet.
 */
function buildService(staffRow: any) {
  const staffUpdates: { id: string; patch: any }[] = [];
  const service = new UsersService(
    {
      async findOne() {
        return {
          id: 'agent-1',
          phone: '9999999999',
          userType: UserTypes.OUTLET_AGENT,
        };
      },
      async update() {
        return { affected: 1 };
      },
    } as any, // users
    {} as any, // userAddress
    {
      async findOne() {
        return staffRow;
      },
      async update(id: string, patch: any) {
        staffUpdates.push({ id, patch });
        return { affected: 1 };
      },
      create(row: any) {
        return row;
      },
      async save(row: any) {
        return row;
      },
    } as any, // staff
    {
      async findOne() {
        return { id: 'outlet-new', wardId: 'ward-1' };
      },
    } as any, // outlets
    {} as any, // orders
    {} as any, // jwt
    {} as any, // areaService
    {} as any, // wardService
  );
  // findOne(id) is a heavy relation load irrelevant here.
  jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
  return { service, staffUpdates };
}

describe('updateStaff re-activates the Staff row when assigning an outlet', () => {
  it('clears isDeleted left over from a soft-deleted previous outlet', async () => {
    const { service, staffUpdates } = buildService({
      id: 'staff-1',
      userId: 'agent-1',
      outletId: 'outlet-deleted',
      isDeleted: true,
    });

    await service.updateStaff('agent-1', { outletId: 'outlet-new' } as any);

    expect(staffUpdates).toEqual([
      { id: 'staff-1', patch: { outletId: 'outlet-new', isDeleted: false } },
    ]);
  });
});
