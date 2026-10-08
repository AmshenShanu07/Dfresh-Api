import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserTypes } from 'src/common/enums';

const AREA = { name: { en: 'Market Road', ml: 'മാർക്കറ്റ് റോഡ്' } };

function buildService(
  staffRow: any,
  {
    canLose = true,
    userType = UserTypes.OUTLET_AGENT,
  }: { canLose?: boolean; userType?: UserTypes } = {},
) {
  const staffUpdates: { id: string; patch: any }[] = [];
  const staffDeletes: any[] = [];
  const lossChecks: { outletId: string; userId: string }[] = [];
  const reconciled: any[] = [];
  const service = new UsersService(
    {
      async findOne() {
        return { id: 'agent-1', phone: '9999999999', userType };
      },
      async update() {
        return { affected: 1 };
      },
      async delete() {
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
      async delete(where: any) {
        staffDeletes.push(where);
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
    {
      async reconcileAreasForStaff(...args: any[]) {
        reconciled.push(args);
      },
      async deactivateAreasForUser() {},
    } as any, // areaService
    {} as any, // wardService
    {
      async assertCanLoseAgent(outletId: string, userId: string) {
        lossChecks.push({ outletId, userId });
        if (!canLose) throw new BadRequestException('needs at least one agent');
      },
    } as any, // outletIntegrity
  );
  // findOne(id) is a heavy relation load irrelevant here.
  jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
  return { service, staffUpdates, staffDeletes, lossChecks, reconciled };
}

const liveStaff = {
  id: 'staff-1',
  userId: 'agent-1',
  outletId: 'outlet-old',
  isDeleted: false,
};

/**
 * Soft-deleting an outlet flags its Staff rows `isDeleted: true`. An agent
 * later moved to another outlet kept that flag, because the edit path only
 * rewrote `outletId` — so the delivery-agent list (which filters
 * `isDeleted: false`) silently dropped them from their new outlet.
 */
describe('updateStaff re-activates the Staff row when assigning an outlet', () => {
  it('clears isDeleted left over from a soft-deleted previous outlet', async () => {
    const { service, staffUpdates, lossChecks } = buildService({
      id: 'staff-1',
      userId: 'agent-1',
      outletId: 'outlet-deleted',
      isDeleted: true,
    });

    await service.updateStaff('agent-1', { outletId: 'outlet-new' } as any);

    expect(staffUpdates).toEqual([
      { id: 'staff-1', patch: { outletId: 'outlet-new', isDeleted: false } },
    ]);
    // A flagged row no longer counts as an agent of its old outlet.
    expect(lossChecks).toEqual([]);
  });
});

/**
 * An active outlet must keep at least one agent, or orders in its ward have
 * nobody to deliver them. Every way an agent can leave an outlet is guarded.
 */
describe('the last agent of an active outlet cannot leave it', () => {
  it('checks the old outlet when an agent moves to another outlet', async () => {
    const { service, lossChecks } = buildService(liveStaff);

    await service.updateStaff('agent-1', { outletId: 'outlet-new' } as any);

    expect(lossChecks).toEqual([{ outletId: 'outlet-old', userId: 'agent-1' }]);
  });

  it('blocks the move and writes nothing when it is the last agent', async () => {
    const { service, staffUpdates } = buildService(liveStaff, {
      canLose: false,
    });

    await expect(
      service.updateStaff('agent-1', { outletId: 'outlet-new' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(staffUpdates).toEqual([]);
  });

  it('blocks a role change away from outlet agent', async () => {
    const { service, staffDeletes } = buildService(liveStaff, {
      canLose: false,
    });

    await expect(
      service.updateStaff('agent-1', { userType: UserTypes.ADMIN } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(staffDeletes).toEqual([]);
  });

  it('does not check when the agent stays on the same outlet', async () => {
    const { service, lossChecks } = buildService(liveStaff);

    await service.updateStaff('agent-1', {
      outletId: 'outlet-old',
      areas: [AREA],
    } as any);

    expect(lossChecks).toEqual([]);
  });

  it('blocks deleting the last agent', async () => {
    const { service, staffDeletes } = buildService(liveStaff, {
      canLose: false,
    });

    await expect(service.deleteStaff('agent-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(staffDeletes).toEqual([]);
  });

  it('blocks deleting the last agent through the generic user delete', async () => {
    const { service, staffDeletes } = buildService(liveStaff, {
      canLose: false,
    });

    await expect(service.remove('agent-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(staffDeletes).toEqual([]);
  });

  it('deletes an agent the outlet can spare', async () => {
    const { service, staffDeletes } = buildService(liveStaff);

    await service.deleteStaff('agent-1');

    expect(staffDeletes).toEqual([{ userId: 'agent-1' }]);
  });
});

describe('an outlet agent needs at least one area', () => {
  it('rejects an empty area list on update', async () => {
    const { service, reconciled } = buildService(liveStaff);

    await expect(
      service.updateStaff('agent-1', {
        outletId: 'outlet-old',
        areas: [],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reconciled).toEqual([]);
  });

  it('rejects areas missing a language, which reconcile would skip', async () => {
    const { service } = buildService(liveStaff);

    await expect(
      service.updateStaff('agent-1', {
        outletId: 'outlet-old',
        areas: [{ name: { en: 'Market Road', ml: '' } }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('leaves areas alone when the update omits them', async () => {
    const { service, reconciled } = buildService(liveStaff);

    await service.updateStaff('agent-1', { name: 'Renamed' } as any);

    expect(reconciled).toEqual([]);
  });

  it('rejects creating an agent with no areas', async () => {
    const { service } = buildService(null);

    await expect(
      service.createStaff({
        name: 'New',
        phone: '9876543210',
        password: 'secret1',
        userType: UserTypes.OUTLET_AGENT,
        outletId: 'outlet-new',
        areas: [],
      } as any),
    ).rejects.toThrow('An outlet agent needs at least one area');
  });
});
