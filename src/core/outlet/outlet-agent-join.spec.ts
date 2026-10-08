import { Repository } from 'typeorm';
import { OutletService } from './outlet.service';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
import { CreateOutletDto } from './dto/create-outlet.dto';

/**
 * The outlet create form submits the logged-in admin's own id as `userId`,
 * and outlet creation used to join that user to the outlet as Staff
 * unconditionally. Because the outlets list counts Staff rows as "Agents
 * Assigned", every outlet an admin created reported a phantom agent.
 *
 * Only OUTLET_AGENTs belong in the Staff join table — the same rule
 * `UsersService.syncStaffOutlet` already enforces on edit.
 */
class FakeStaffRepository {
  rows: Partial<Staff>[] = [];

  create(row: Partial<Staff>) {
    return row;
  }

  async save(row: Partial<Staff>) {
    this.rows.push(row);
    return row;
  }
}

class FakeOutletRepository {
  create(row: Partial<Outlets>) {
    return row;
  }

  async save(row: Partial<Outlets>) {
    return { ...row, id: 'outlet-1' };
  }

  async findOne(_opts: any) {
    return { id: 'outlet-1' };
  }
}

function buildService(user: Partial<User> | null) {
  const staffRepo = new FakeStaffRepository();
  const service = new OutletService(
    new FakeOutletRepository() as unknown as Repository<Outlets>,
    staffRepo as unknown as Repository<Staff>,
    { async findOne(_opts: any) { return user; } } as unknown as Repository<User>,
  );
  return { service, staffRepo };
}

const dto = (userId?: string) =>
  ({
    name: 'Neerikode',
    location: 'Neerikode',
    phone: '7511110094',
    commission: 10,
    isSalesEnabled: true,
    userId,
  }) as CreateOutletDto;

describe('OutletService.create — Staff join row', () => {
  it('does not join the creating admin to the outlet as staff', async () => {
    const { service, staffRepo } = buildService({
      id: 'admin-1',
      userType: UserTypes.ADMIN,
    });

    await service.create(dto('admin-1'));

    expect(staffRepo.rows).toHaveLength(0);
  });

  it('joins an outlet agent to the outlet as staff', async () => {
    const { service, staffRepo } = buildService({
      id: 'agent-1',
      userType: UserTypes.OUTLET_AGENT,
    });

    await service.create(dto('agent-1'));

    expect(staffRepo.rows).toEqual([
      { outletId: 'outlet-1', userId: 'agent-1' },
    ]);
  });

  it('creates the outlet when no userId is supplied at all', async () => {
    const { service, staffRepo } = buildService(null);

    const outlet = await service.create(dto(undefined));

    expect(outlet).toEqual({ id: 'outlet-1' });
    expect(staffRepo.rows).toHaveLength(0);
  });
});

describe('OutletService.create — isSalesEnabled', () => {
  // `create()` used to drop `isSalesEnabled`, so the column default (false)
  // won and every new outlet landed disabled regardless of the checkbox.
  async function savedOutlet(isSalesEnabled: boolean) {
    const outletRepo = new FakeOutletRepository();
    const saveSpy = jest.spyOn(outletRepo, 'save');
    const service = new OutletService(
      outletRepo as unknown as Repository<Outlets>,
      new FakeStaffRepository() as unknown as Repository<Staff>,
      {
        async findOne(_opts: any) {
          return null;
        },
      } as unknown as Repository<User>,
    );

    await service.create({ ...dto(undefined), isSalesEnabled });

    return saveSpy.mock.calls[0][0];
  }

  it('persists isSalesEnabled = true from the DTO', async () => {
    expect((await savedOutlet(true)).isSalesEnabled).toBe(true);
  });

  it('persists isSalesEnabled = false from the DTO', async () => {
    expect((await savedOutlet(false)).isSalesEnabled).toBe(false);
  });
});
