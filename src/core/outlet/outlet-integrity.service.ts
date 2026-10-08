import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { UserTypes } from 'src/common/enums';

/**
 * Guards the outlet ⇄ agent invariant: an active outlet always has at least
 * one OUTLET_AGENT. Orders are only routed to outlets with an agent (see
 * OrderService.findSellingOutletsForWard), so an agentless active outlet
 * would silently stop taking orders. Inactive outlets are exempt — that is
 * how an admin winds an outlet down before deleting it.
 */
@Injectable()
export class OutletIntegrityService {
  constructor(
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
  ) {}

  /**
   * Active outlet agents joined to an outlet. Filters on userType defensively:
   * Staff should only ever hold OUTLET_AGENT rows, but older data didn't.
   */
  async countActiveAgents(outletId: string, excludeUserId?: string) {
    const staff = await this.staffRepository.find({
      where: { outletId, isDeleted: false },
      relations: { user: true },
    });
    return staff.filter(
      (s) =>
        s.user?.userType === UserTypes.OUTLET_AGENT &&
        s.userId !== excludeUserId,
    ).length;
  }

  /**
   * Throws when removing `userId` from `outletId` (delete, move to another
   * outlet, or role change) would leave an active outlet with no agent.
   */
  async assertCanLoseAgent(outletId: string, userId: string) {
    const outlet = await this.outletRepository.findOne({
      where: { id: outletId },
    });
    if (!outlet || outlet.isDeleted || !outlet.isActive) return;

    const remaining = await this.countActiveAgents(outletId, userId);
    if (remaining === 0) {
      throw new BadRequestException(
        `${outlet.name || 'This outlet'} needs at least one agent while active. Add another agent or set the outlet inactive first.`,
      );
    }
  }
}
