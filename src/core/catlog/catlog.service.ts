import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCatlogDto } from './dto/create-catlog.dto';
// import { ShareCatlogDto } from './dto/share-catlog.dto';
import { PrismaService } from 'src/services/prisma.service';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

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
      createCatlogDto.productIds.map((productId) => {
        return this.prismaService.catalogProducts.create({
          data: {
            catalogId: catalog.id,
            productId,
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

  getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }
    return this.prismaService.catalog.findMany({
      orderBy: {
        createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  getCatalogProducts(id: string) {
    return this.prismaService.catalogProducts.findMany({
      where: { catalogId: id },
      include: { product: true },
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

  // async shareCatlog(shareCatlogDto: ShareCatlogDto) {
  //   const catalog = await this.prismaService.catalog.findFirst({
  //     where: { id: shareCatlogDto.catlogId },
  //   });

  //   if (!catalog) {
  //     return new BadRequestException('Catalog not found');
  //   }

  //   await Promise.all(
  //     shareCatlogDto.products.map((product) => {
  //       return this.prismaService.catalogProducts.create({
  //         data: {
  //           catalogId: catalog.id,
  //           productId: product.productId,
  //           qnty: product.qnty,
  //           qntyUnit: product.qntyUnit,
  //           price: product.price,
  //         },
  //       });
  //     }),
  //   );

  //   await this.prismaService.catalog.update({
  //     where: { id: catalog.id },
  //     data: {
  //       publishedDate: new Date(shareCatlogDto.publishDate),
  //       isShared: true,
  //     },
  //   });

  //   return this.findOne(catalog.id);
  // }

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
