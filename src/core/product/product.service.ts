import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ProductService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createProductDto: CreateProductDto) {
    return this.prismaService.products.create({
      data: createProductDto,
    });
  }

  findAll() {
    return this.prismaService.products.findMany({ where: { isActive: true } });
  }

  findOne(id: string) {
    return this.prismaService.products.findFirst({ where: { id } });
  }

  update(id: string, updateProductDto: UpdateProductDto) {
    return this.prismaService.products.update({
      where: { id },
      data: updateProductDto,
    });
  }

  remove(id: string) {
    return this.prismaService.products.delete({ where: { id } });
  }
}
