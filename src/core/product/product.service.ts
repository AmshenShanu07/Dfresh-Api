import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Injectable()
export class ProductService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createProductDto: CreateProductDto) {
    return this.prismaService.products.create({
      data: createProductDto,
    });
  }

  findAll() {
    return this.prismaService.products.findMany({
      where: { isActive: true, isDeleted: false },
    });
  }

  findOne(id: string) {
    return this.prismaService.products.findFirst({ where: { id } });
  }

  getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }
    return this.prismaService.products.findMany({
      orderBy: {
        createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  update(id: string, updateProductDto: UpdateProductDto) {
    return this.prismaService.products.update({
      where: { id },
      data: updateProductDto,
    });
  }

  softDelete(id: string) {
    return this.prismaService.products.update({
      where: { id },
      data: { isDeleted: false },
    });
  }

  hardDelete(id: string) {
    return this.prismaService.products.delete({ where: { id } });
  }
}
