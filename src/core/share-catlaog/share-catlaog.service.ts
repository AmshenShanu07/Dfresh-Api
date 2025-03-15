import { Injectable } from '@nestjs/common';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Injectable()
export class ShareCatlaogService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createShareCatlaogDto: CreateShareCatlaogDto) {
    const shareCatalog = this.prismaService.shareCatalog.create({
      data: {
        catalogId: createShareCatlaogDto.catalogId,
        ShareCatalogProducts: {
          createMany: {
            data: createShareCatlaogDto.shareCatalogProducts.map((product) => ({
              productId: product.productId,
              qnty: product.qnty,
              qntyUnit: product.qntyUnit,
              price: product.price,
            })),
          },
        },
      },
      include: {
        ShareCatalogProducts: { include: { product: true } },
        catalog: true,
      },
    });
    return shareCatalog;
  }

  findAll() {
    return this.prismaService.shareCatalog.findMany({
      include: {
        ShareCatalogProducts: { include: { product: true } },
        catalog: true,
      },
    });
  }

  findOne(id: string) {
    return this.prismaService.shareCatalog.findFirst({
      where: { id },
      include: {
        ShareCatalogProducts: { include: { product: true } },
        catalog: true,
      },
    });
  }

  getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }
    return this.prismaService.shareCatalog.findMany({
      orderBy: {
        createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  update(id: string, updateShareCatlaogDto: UpdateShareCatlaogDto) {
    return { id, ...updateShareCatlaogDto };
  }

  remove(id: string) {
    return `This action removes a #${id} shareCatlaog`;
  }
}
