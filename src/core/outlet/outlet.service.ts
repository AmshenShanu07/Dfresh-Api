import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { PrismaService } from 'src/services/prisma.service';
import { UserTypes } from '@prisma/client';

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

  async update(id: string, updateOutletDto: UpdateOutletDto) {
    const outlet = await this.prismaService.outlets.update({
      where: { id },
      data: {
        name: updateOutletDto.name,
        address: updateOutletDto.address,
        phone: updateOutletDto.phone,
        location: updateOutletDto.location,
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
