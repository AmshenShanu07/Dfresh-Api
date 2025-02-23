import { Injectable } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Injectable()
export class SupplierService {
  constructor(private readonly prismaService: PrismaService) {}
  create(createSupplierDto: CreateSupplierDto) {
    return this.prismaService.supplier.create({
      data: {
        name: createSupplierDto.name,
        supplierCode: createSupplierDto.supplierCode,
        phone: createSupplierDto.phone,
        email: createSupplierDto.email,
        address: createSupplierDto.address,
      },
    });
  }

  findAll() {
    return this.prismaService.supplier.findMany({});
  }

  getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }
    return this.prismaService.supplier.findMany({
      orderBy: {
        createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  findOne(id: string) {
    return this.prismaService.supplier.findFirst({ where: { id } });
  }

  update(id: string, updateSupplierDto: UpdateSupplierDto) {
    return this.prismaService.supplier.update({
      where: { id },
      data: {
        name: updateSupplierDto.name,
        supplierCode: updateSupplierDto.supplierCode,
        phone: updateSupplierDto.phone,
        email: updateSupplierDto.email,
        address: updateSupplierDto.address,
      },
    });
  }

  remove(id: string) {
    return this.prismaService.supplier.delete({
      where: { id },
    });
  }
}
