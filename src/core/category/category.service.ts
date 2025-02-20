import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from 'src/services/prisma.service';

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
