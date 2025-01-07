import { Injectable } from '@nestjs/common';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class OutletService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createOutletDto: CreateOutletDto) {
    return this.prismaService.outlets.create({
      data: {
        name: createOutletDto.name,
        address: createOutletDto.address,
        phone: createOutletDto.phone,
        location: createOutletDto.location,
        userId: createOutletDto.userId,
      },
    });
  }

  findAll() {
    return this.prismaService.outlets.findMany({
      include: { user: true },
    });
  }

  findOne(id: string) {
    return this.prismaService.outlets.findFirst({
      where: { id },
      include: { user: true },
    });
  }

  update(id: string, updateOutletDto: UpdateOutletDto) {
    return this.prismaService.outlets.update({
      where: { id },
      data: {
        name: updateOutletDto.name,
        address: updateOutletDto.address,
        phone: updateOutletDto.phone,
        location: updateOutletDto.location,
        userId: updateOutletDto.userId,
      },
    });
  }

  remove(id: string) {
    return this.prismaService.outlets.delete({ where: { id } });
  }
}
