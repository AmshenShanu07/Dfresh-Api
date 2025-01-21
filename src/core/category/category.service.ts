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
      where: { isActive: true },
    });
  }

  findOne(id: string) {
    return this.prismaService.category.findFirst({ where: { id: id } });
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return this.prismaService.category.update({
      where: { id: id },
      data: updateCategoryDto,
    });
  }

  remove(id: string) {
    return this.prismaService.category.delete({ where: { id: id } });
  }
}
