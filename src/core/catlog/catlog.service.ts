import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCatlogDto } from './dto/create-catlog.dto';
// import { ShareCatlogDto } from './dto/share-catlog.dto';
import { PrismaService } from 'src/services/prisma.service';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { UpdateCatlogDto } from './dto/update-catlog.dto';

@Injectable()
export class CatlogService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createCatlogDto: CreateCatlogDto) {
    const catalog = await this.prismaService.catalog.create({
      data: {
        name: createCatlogDto.name,
        description: createCatlogDto.description,
      },
    });
    await Promise.all(
      createCatlogDto.products.map((product) => {
        return this.prismaService.catalogProducts.create({
          data: {
            productId: product.productId,
            catalogId: catalog.id,
            productCatalogId: product.productCatalogId,
          },
        });
      }),
    );

    return this.findOne(catalog.id);
  }

  findAll() {
    return this.prismaService.catalog.findMany({
      where: { isDeleted: false },
      include: { CatalogProducts: { include: { product: true } } },
    });
  }

  getAllCatlogDropDown() {
    return this.prismaService.catalog.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true },
    });
  }

  findOne(id: string) {
    return this.prismaService.catalog.findFirst({
      where: { id },
      include: { CatalogProducts: { include: { product: true } } },
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
      this.prismaService.catalog.count(),
      this.prismaService.catalog.findMany({
        include: {
          CatalogProducts: {
            include: { product: { include: { category: true } } },
          },
        },
        orderBy: {
          createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  getCatalogProducts(id: string) {
    return this.prismaService.catalogProducts.findMany({
      where: { catalogId: id },
      include: { product: { include: { category: true } } },
    });
  }

  async removeProduct(data: RemoveCatlogProductDto) {
    const catalog = await this.prismaService.catalog.findFirst({
      where: { id: data.catlogId },
    });

    if (!catalog) {
      return new BadRequestException('Catalog not found');
    }

    await this.prismaService.catalogProducts.deleteMany({
      where: {
        catalogId: catalog.id,
        productId: data.productId,
      },
    });

    return this.findOne(catalog.id);
  }

  async update(id: string, updateCatlogDto: UpdateCatlogDto) {
    await this.prismaService.catalogProducts.deleteMany({
      where: { catalogId: id },
    });

    await Promise.all(
      updateCatlogDto.products.map((product) => {
        return this.prismaService.catalogProducts.create({
          data: {
            productId: product.productId,
            catalogId: id,
            productCatalogId: product.productCatalogId,
          },
        });
      }),
    );

    return this.prismaService.catalog.update({
      where: { id },
      data: {
        name: updateCatlogDto.name,
        description: updateCatlogDto.description,
      },
    });
  }

  softDelete(id: string) {
    return this.prismaService.catalog.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  hardDelete(id: string) {
    return this.prismaService.catalog.delete({ where: { id } });
  }
}
