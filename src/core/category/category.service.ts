import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.prismaService.category.create({
      data: createCategoryDto,
    });
  }

  findAll() {
    return this.prismaService.category.findMany({
      where: { isActive: true, isDeleted: false },
      select: {
        id: true,
        name: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        _count: { select: { Products: true } },
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.category.findFirst({
      where: { id: id },
      select: {
        id: true,
        name: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        _count: { select: { Products: true } },
      },
    });
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }
    const [total, data] = await Promise.all([
      this.prismaService.category.count({ where: { isDeleted: false } }),
      this.prismaService.category.findMany({
        where: { isDeleted: false },
        orderBy: {
          createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prismaService.category.update({
      where: { id: id },
      data: updateCategoryDto,
    });
  }

  softDelete(id: string) {
    return this.prismaService.category.update({
      where: { id: id },
      data: { isDeleted: true },
    });
  }

  hardDelete(id: string) {
    return this.prismaService.category.delete({ where: { id: id } });
  }
}
