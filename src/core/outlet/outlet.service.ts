import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletFilterDto } from './dto/filter-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const user = await this.userRepository.findOne({
      where: { id: createOutletDto.userId },
    });

    if (!user) return new BadRequestException('User not found');

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

    await this.staffRepository.save(
      this.staffRepository.create({
        outletId: outlet.id,
        userId: user.id,
      }),
    );

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

    const [total, data] = await Promise.all([
      this.outletRepository.count({ where: { isDeleted: false } }),
      this.outletRepository.find({
        where: { isDeleted: false },
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

    const outletAgent = await this.staffRepository
      .createQueryBuilder('staff')
      .leftJoinAndSelect('staff.user', 'user')
      .where('staff.outletId = :outletId', { outletId: id })
      .andWhere('user.userType = :userType', { userType: UserTypes.OUTLET_AGENT })
      .getOne();

    if (outletAgent) {
      await this.staffRepository.update(outletAgent.id, {
        userId: updateOutletDto.userId,
      });
    }

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
