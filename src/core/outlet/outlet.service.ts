import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { PrismaService } from 'src/services/prisma.service';
import { UserTypes } from '@prisma/client';
import { OutletFilterDto } from './dto/filter-list.dto';

@Injectable()
export class OutletService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createOutletDto: CreateOutletDto) {
    const user = await this.prismaService.user.findFirst({
      where: { id: createOutletDto.userId },
    });

    if (!user) return new BadRequestException('User not found');

    const outlet = await this.prismaService.outlets.create({
      data: {
        name: createOutletDto.name,
        address: createOutletDto.address,
        phone: createOutletDto.phone,
        location: createOutletDto.location,
        commission: createOutletDto.commission,
      },
    });

    await this.prismaService.staff.create({
      data: {
        outletId: outlet.id,
        userId: user.id,
      },
    });

    return this.findOne(outlet.id);
  }

  findAll() {
    return this.prismaService.outlets.findMany({
      where: { isDeleted: false },
      include: { OutletAgent: { include: { user: true } } },
    });
  }

  findOne(id: string) {
    return this.prismaService.outlets.findFirst({
      where: { id },
      include: { OutletAgent: { include: { user: true } } },
    });
  }

  filterList(filter: OutletFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    return this.prismaService.outlets.findMany({
      where: { isDeleted: false },
      include: { OutletAgent: { include: { user: true } } },
      orderBy: {
        [filter.sortBy]: filter.sortOrder === -1 ? 'asc' : 'desc',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  async update(id: string, updateOutletDto: UpdateOutletDto) {
    const outlet = await this.prismaService.outlets.update({
      where: { id },
      data: {
        name: updateOutletDto.name,
        address: updateOutletDto.address,
        phone: updateOutletDto.phone,
        location: updateOutletDto.location,
        commission: updateOutletDto.commission,
        isActive: updateOutletDto.isActive,
      },
    });

    const outletAgent = await this.prismaService.staff.findFirst({
      where: {
        outletId: id,
        user: { userType: UserTypes.OUTLET_AGENT },
      },
    });

    if (outletAgent) {
      await this.prismaService.staff.update({
        where: { id: outletAgent.id },
        data: { userId: updateOutletDto.userId },
      });
    }

    return this.findOne(outlet.id);
  }

  async softDelete(id: string) {
    await this.prismaService.staff.updateMany({
      where: { outletId: id },
      data: { isDeleted: true },
    });
    return this.prismaService.outlets.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async hardDelete(id: string) {
    await this.prismaService.staff.deleteMany({ where: { outletId: id } });
    return this.prismaService.outlets.delete({ where: { id } });
  }
}
