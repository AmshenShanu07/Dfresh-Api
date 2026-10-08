import { BadRequestException } from '@nestjs/common';
import { OutletIntegrityService } from './outlet-integrity.service';
import { UserTypes } from 'src/common/enums';

function buildService(outlet: any, staff: any[]) {
  return new OutletIntegrityService(
    {
      async findOne() {
        return outlet;
      },
    } as any,
    {
      async find() {
        return staff;
      },
    } as any,
  );
}

const agentRow = (userId: string, userType = UserTypes.OUTLET_AGENT) => ({
  userId,
  user: { id: userId, userType },
});

describe('OutletIntegrityService', () => {
  const active = {
    id: 'outlet-1',
    name: 'Neerikode',
    isActive: true,
    isDeleted: false,
  };

  it('counts only outlet agents, excluding the given user', async () => {
    const service = buildService(active, [
      agentRow('a1'),
      agentRow('a2'),
      agentRow('admin', UserTypes.ADMIN),
    ]);

    expect(await service.countActiveAgents('outlet-1')).toBe(2);
    expect(await service.countActiveAgents('outlet-1', 'a1')).toBe(1);
  });

  it('blocks removing the last agent of an active outlet', async () => {
    const service = buildService(active, [agentRow('a1')]);

    await expect(
      service.assertCanLoseAgent('outlet-1', 'a1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows removing an agent when another remains', async () => {
    const service = buildService(active, [agentRow('a1'), agentRow('a2')]);

    await expect(
      service.assertCanLoseAgent('outlet-1', 'a1'),
    ).resolves.toBeUndefined();
  });

  it('allows removing the last agent of an inactive outlet', async () => {
    const service = buildService({ ...active, isActive: false }, [
      agentRow('a1'),
    ]);

    await expect(
      service.assertCanLoseAgent('outlet-1', 'a1'),
    ).resolves.toBeUndefined();
  });
});
