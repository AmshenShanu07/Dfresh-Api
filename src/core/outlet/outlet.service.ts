import { Injectable } from '@nestjs/common';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletFilterDto } from './dto/filter-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';

@Injectable()
export class OutletService {
  constructor(
    @InjectRepository(Outlets)
    private readonly outletRepository: Repository<Outlets>,
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createOutletDto: CreateOutletDto) {
    const outlet = await this.outletRepository.save(
      this.outletRepository.create({
        name: createOutletDto.name,
        address: createOutletDto.address,
        phone: createOutletDto.phone,
        location: createOutletDto.location,
        commission: createOutletDto.commission,
        wardId: createOutletDto.wardId ?? null,
      }),
    );

    // Only outlet agents belong in the Staff join table — the same rule
    // `UsersService.syncStaffOutlet` enforces on edit. The create form submits
    // the logged-in admin's own id here, so joining it unconditionally made
    // every outlet an admin created report a phantom "agent assigned".
    if (createOutletDto.userId) {
      const user = await this.userRepository.findOne({
        where: { id: createOutletDto.userId },
      });

      if (user?.userType === UserTypes.OUTLET_AGENT) {
        await this.staffRepository.save(
          this.staffRepository.create({
            outletId: outlet.id,
            userId: user.id,
          }),
        );
      }
    }

    return this.findOne(outlet.id);
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
    await this.outletRepository.update(id, {
      name: updateOutletDto.name,
      address: updateOutletDto.address,
      phone: updateOutletDto.phone,
      location: updateOutletDto.location,
      commission: updateOutletDto.commission,
      isSalesEnabled: updateOutletDto.isSalesEnabled,
      isActive: updateOutletDto.isActive,
      wardId: updateOutletDto.wardId,
    });

    return this.findOne(id);
  }

  async softDelete(id: string) {
    await this.staffRepository.update({ outletId: id }, { isDeleted: true });
    return this.outletRepository.update(id, { isDeleted: true });
  }

  async hardDelete(id: string) {
    await this.staffRepository.delete({ outletId: id });
    return this.outletRepository.delete(id);
  }
}
