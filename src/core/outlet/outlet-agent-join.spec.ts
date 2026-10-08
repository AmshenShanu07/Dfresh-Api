import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OutletService } from './outlet.service';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
import { CreateOutletDto } from './dto/create-outlet.dto';

/**
 * An active outlet with no outlet agent can't receive orders (no agent to
 * deliver them), and agents used to be created only from Staff Management, so
 * an admin could forget them. Outlets are now created together with at least
 * one agent, in one transaction.
 */
class FakeRepo {
  rows: any[] = [];
  constructor(private prefix: string) {}
  create(row: any) {
    return row;
  }
  async save(row: any) {
    const saved = { ...row, id: `${this.prefix}-${this.rows.length + 1}` };
    this.rows.push(saved);
    return saved;
  }
}

function buildService({
  takenPhones = [] as string[],
  agentCount = 1,
  outlet = { id: 'outlet-1', wardId: 'ward-1', isActive: true } as any,
  failAreas = false,
} = {}) {
  const outlets = new FakeRepo('outlet');
  const users = new FakeRepo('user');
  const staff = new FakeRepo('staff');
  const repos = new Map<any, FakeRepo>([
    [Outlets, outlets],
    [User, users],
    [Staff, staff],
  ]);
  const committed = { value: false };
  const reconciled: any[] = [];
  const outletUpdates: any[] = [];
  const outletDeletes: any[] = [];
  const movedAreas: any[] = [];

  const dataSource = {
    async transaction(work: (manager: any) => Promise<any>) {
      const result = await work({ getRepository: (e: any) => repos.get(e) });
      committed.value = true;
      return result;
    },
  };

  const service = new OutletService(
    {
      async findOne() {
        return outlet;
      },
      async update(id: string, patch: any) {
        outletUpdates.push({ id, patch });
        return { affected: 1 };
      },
      async delete(id: string) {
        outletDeletes.push(id);
        return { affected: 1 };
      },
    } as unknown as Repository<Outlets>,
    {
      async find() {
        return takenPhones.map((phone) => ({ phone }));
      },
    } as unknown as Repository<User>,
    dataSource as any,
    {
      async reconcileAreasForStaff(...args: any[]) {
        if (failAreas) throw new BadRequestException('duplicate area');
        reconciled.push(args);
      },
      async moveOutletAreasToWard(outletId: string, wardId: string) {
        movedAreas.push({ outletId, wardId });
      },
    } as any,
    {
      async countActiveAgents() {
        return agentCount;
      },
    } as any,
  );
  jest
    .spyOn(service, 'findOne')
    .mockImplementation(async (id) => ({ id }) as any);

  return {
    service,
    outlets,
    users,
    staff,
    committed,
    reconciled,
    outletUpdates,
    outletDeletes,
    movedAreas,
  };
}

const AREA = { name: { en: 'Market Road', ml: 'മാർക്കറ്റ് റോഡ്' } };
const agent = (phone: string, areas: any[] = [AREA]) => ({
  name: `Agent ${phone}`,
  phone,
  address: 'Kochi',
  password: 'secret1',
  areas,
});

const dto = (overrides: Partial<CreateOutletDto> = {}) =>
  ({
    name: 'Neerikode',
    location: 'Neerikode',
    phone: '7511110094',
    commission: 10,
    isSalesEnabled: true,
    wardId: 'ward-1',
    agents: [agent('9000000001')],
    ...overrides,
  }) as CreateOutletDto;

describe('OutletService.create — with its outlet agents', () => {
  it('creates the outlet, an OUTLET_AGENT user, its Staff row and areas', async () => {
    const { service, outlets, users, staff, reconciled, committed } =
      buildService();

    const result = await service.create(dto());

    expect(result).toEqual({ id: 'outlet-1' });
    expect(outlets.rows[0]).toMatchObject({ wardId: 'ward-1' });
    expect(users.rows).toHaveLength(1);
    expect(users.rows[0]).toMatchObject({
      phone: '9000000001',
      userType: UserTypes.OUTLET_AGENT,
    });
    expect(users.rows[0].password).not.toBe('secret1');
    expect(staff.rows).toEqual([
      { userId: 'user-1', outletId: 'outlet-1', id: 'staff-1' },
    ]);
    expect(reconciled[0].slice(0, 3)).toEqual(['user-1', 'outlet-1', [AREA]]);
    // Areas are written through the transaction's manager.
    expect(reconciled[0][3]).toBeDefined();
    expect(committed.value).toBe(true);
  });

  it('rejects an outlet with no agents', async () => {
    const { service, outlets } = buildService();

    await expect(service.create(dto({ agents: [] }))).rejects.toThrow(
      'Add at least one outlet agent',
    );
    expect(outlets.rows).toHaveLength(0);
  });

  it('rejects an agent with no usable area', async () => {
    const { service, outlets } = buildService();

    await expect(
      service.create(
        dto({ agents: [agent('9000000001', [{ name: { en: 'X', ml: '' } }])] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(outlets.rows).toHaveLength(0);
  });

  it('rejects two agents with the same mobile number', async () => {
    const { service, outlets } = buildService();

    await expect(
      service.create(
        dto({ agents: [agent('9000000001'), agent('9000000001')] }),
      ),
    ).rejects.toThrow('Two agents have the same mobile number');
    expect(outlets.rows).toHaveLength(0);
  });

  it('rejects a mobile number that already belongs to a user', async () => {
    const { service, outlets } = buildService({ takenPhones: ['9000000001'] });

    await expect(service.create(dto())).rejects.toThrow('User already exist');
    expect(outlets.rows).toHaveLength(0);
  });

  it('does not commit when an agent fails mid-transaction', async () => {
    const { service, committed } = buildService({ failAreas: true });

    await expect(service.create(dto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(committed.value).toBe(false);
  });

  // `create()` used to drop `isSalesEnabled`, so the column default (false)
  // won and every new outlet landed disabled regardless of the checkbox.
  it.each([true, false])('persists isSalesEnabled = %s', async (flag) => {
    const { service, outlets } = buildService();

    await service.create(dto({ isSalesEnabled: flag }));

    expect(outlets.rows[0].isSalesEnabled).toBe(flag);
  });
});

describe('OutletService.update — agent and ward rules', () => {
  it('blocks keeping an outlet active with no agent', async () => {
    const { service, outletUpdates } = buildService({ agentCount: 0 });

    await expect(service.update('outlet-1', { name: 'X' })).rejects.toThrow(
      'Add at least one agent before activating this outlet',
    );
    expect(outletUpdates).toHaveLength(0);
  });

  it('allows setting an agentless outlet inactive', async () => {
    const { service, outletUpdates } = buildService({ agentCount: 0 });

    await service.update('outlet-1', { isActive: false, isSalesEnabled: true });

    expect(outletUpdates).toHaveLength(1);
    expect(outletUpdates[0].patch).toMatchObject({
      isActive: false,
      isSalesEnabled: false,
    });
  });

  it('rejects clearing the ward', async () => {
    const { service } = buildService();

    await expect(
      service.update('outlet-1', { wardId: null as any }),
    ).rejects.toThrow('Ward is required');
  });

  it("moves the outlet's areas when its ward changes", async () => {
    const { service, movedAreas } = buildService();

    await service.update('outlet-1', { wardId: 'ward-2' });

    expect(movedAreas).toEqual([{ outletId: 'outlet-1', wardId: 'ward-2' }]);
  });

  it('leaves areas alone when the ward is unchanged', async () => {
    const { service, movedAreas } = buildService();

    await service.update('outlet-1', { wardId: 'ward-1' });

    expect(movedAreas).toEqual([]);
  });
});

describe('OutletService delete — agents must go first', () => {
  it('blocks deleting an outlet that still has agents', async () => {
    const { service, outletUpdates } = buildService({ agentCount: 1 });

    await expect(service.softDelete('outlet-1')).rejects.toThrow(
      "Move or delete this outlet's agents first",
    );
    expect(outletUpdates).toHaveLength(0);
  });

  it('deletes an outlet with no agents', async () => {
    const { service, outletUpdates } = buildService({ agentCount: 0 });

    await service.softDelete('outlet-1');

    expect(outletUpdates).toEqual([
      { id: 'outlet-1', patch: { isDeleted: true } },
    ]);
  });
});
