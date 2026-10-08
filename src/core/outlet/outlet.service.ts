import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletFilterDto } from './dto/filter-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
import { AreaService, countValidAreas } from '../area/area.service';
import { OutletIntegrityService } from './outlet-integrity.service';

@Injectable()
export class OutletService {
  constructor(
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly areaService: AreaService,
    private readonly outletIntegrity: OutletIntegrityService,
  ) {}

  /**
   * Creates the outlet together with its outlet agents (User + Staff + Areas)
   * in one transaction. An outlet starts active, and an active outlet with no
   * agent can't receive orders — so creation requires at least one agent, and
   * any failure (duplicate phone, bad area) leaves nothing behind.
   */
  async create(createOutletDto: CreateOutletDto) {
    const agents = createOutletDto.agents ?? [];
    if (agents.length === 0) {
      throw new BadRequestException('Add at least one outlet agent');
    }
    for (const agent of agents) {
      if (countValidAreas(agent.areas) === 0) {
        throw new BadRequestException(
          `Agent ${agent.name} needs at least one area`,
        );
      }
    }

    // `phone` is unique and doubles as the login id.
    const phones = agents.map((a) => a.phone.trim());
    if (new Set(phones).size !== phones.length) {
      throw new BadRequestException('Two agents have the same mobile number');
    }
    const taken = await this.userRepository.find({
      where: { phone: In(phones) },
    });
    if (taken.length) {
      throw new BadRequestException(
        `User already exist: ${taken.map((u) => u.phone).join(', ')}`,
      );
    }

    const outletId = await this.dataSource.transaction(async (manager) => {
      const outlet = await manager.getRepository(Outlets).save(
        manager.getRepository(Outlets).create({
          name: createOutletDto.name,
          address: createOutletDto.address,
          phone: createOutletDto.phone,
          location: createOutletDto.location,
          commission: createOutletDto.commission,
          isSalesEnabled: createOutletDto.isSalesEnabled,
          wardId: createOutletDto.wardId,
        }),
      );

      for (const agent of agents) {
        const user = await manager.getRepository(User).save(
          manager.getRepository(User).create({
            name: agent.name,
            phone: agent.phone.trim(),
            password: await bcrypt.hash(agent.password, 10),
            userType: UserTypes.OUTLET_AGENT,
            address: agent.address,
          }),
        );
        await manager
          .getRepository(Staff)
          .save(
            manager
              .getRepository(Staff)
              .create({ userId: user.id, outletId: outlet.id }),
          );
        await this.areaService.reconcileAreasForStaff(
          user.id,
          outlet.id,
          agent.areas,
          manager,
        );
      }

      return outlet.id;
    });

    return this.findOne(outletId);
  }

  findAll() {
    return this.outletRepository.find({
      where: { isDeleted: false },
      relations: { OutletAgent: { user: true } },
    });
  }

  findOne(id: string) {
    return this.outletRepository.findOne({
      where: { id },
      relations: { OutletAgent: { user: true } },
    });
  }

  async filterList(filter: OutletFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    // One `where` shared by the count and the find, so `total` tracks the
    // filtered result set instead of the full table.
    // `!== undefined`, not truthiness — `false` is a real filter value.
    const where: FindOptionsWhere<Outlets> = { isDeleted: false };
    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }
    if (filter.isSalesEnabled !== undefined) {
      where.isSalesEnabled = filter.isSalesEnabled;
    }

    const [total, data] = await Promise.all([
      this.outletRepository.count({ where }),
      this.outletRepository.find({
        where,
        relations: { OutletAgent: { user: true } },
        order: {
          [filter.sortBy]: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async update(id: string, updateOutletDto: UpdateOutletDto) {
    const outlet = await this.outletRepository.findOne({ where: { id } });
    if (!outlet || outlet.isDeleted) {
      throw new BadRequestException('Outlet not found');
    }

    // Omitted keeps the current ward; an outlet can't be left without one.
    if (updateOutletDto.wardId === null || updateOutletDto.wardId === '') {
      throw new BadRequestException('Ward is required');
    }

    const willBeActive = updateOutletDto.isActive ?? outlet.isActive;
    if (
      willBeActive &&
      (await this.outletIntegrity.countActiveAgents(id)) === 0
    ) {
      throw new BadRequestException(
        'Add at least one agent before activating this outlet',
      );
    }

    await this.outletRepository.update(id, {
      name: updateOutletDto.name,
      address: updateOutletDto.address,
      phone: updateOutletDto.phone,
      location: updateOutletDto.location,
      commission: updateOutletDto.commission,
      // An inactive outlet can't sell — switching it off turns sales off too.
      isSalesEnabled: willBeActive ? updateOutletDto.isSalesEnabled : false,
      isActive: updateOutletDto.isActive,
      wardId: updateOutletDto.wardId,
    });

    if (updateOutletDto.wardId && updateOutletDto.wardId !== outlet.wardId) {
      await this.areaService.moveOutletAreasToWard(id, updateOutletDto.wardId);
    }

    return this.findOne(id);
  }

  // Agents (and their areas) must be moved or deleted first — the outlet has
  // to be set inactive before its last agent can go. Deleting it with agents
  // attached used to leave their areas active and orderable.
  private async assertNoAgents(id: string) {
    if ((await this.outletIntegrity.countActiveAgents(id)) > 0) {
      throw new BadRequestException(
        "Move or delete this outlet's agents first",
      );
    }
  }

  async softDelete(id: string) {
    await this.assertNoAgents(id);
    return this.outletRepository.update(id, { isDeleted: true });
  }

  async hardDelete(id: string) {
    await this.assertNoAgents(id);
    return this.outletRepository.delete(id);
  }
}
