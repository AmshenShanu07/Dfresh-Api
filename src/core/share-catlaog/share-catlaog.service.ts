import { Injectable } from '@nestjs/common';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';

@Injectable()
export class ShareCatlaogService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createShareCatlaogDto: CreateShareCatlaogDto) {

    const currectCatlog = await this.prismaService.shareCatalog.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
      },
      select: {
        ShareCatalogProducts: {
          select: {
            productId: true,
            productCatalogId: true,
          }
        }
      }
    })

    await Promise.all(currectCatlog.ShareCatalogProducts.map((product) => {
      return this.catalogService.updateProduct(product.productCatalogId, { availability: "out of stock" })
    }))

    await this.prismaService.shareCatalog.updateMany({
      where: {
        isActive: true,
        isDeleted: false,
      },
      data: {
        isActive: false,
      }
    })

    const productsList = await this.prismaService.products.findMany({
      where: {
        id: {
          in: createShareCatlaogDto.shareCatalogProducts.map((product) => product.productId),
        },
      },
    });

    await Promise.all(
      productsList.map((product) => {
        const productData: MetaUpdateCatalogProductDto = {
          availability: "in stock",
          price: createShareCatlaogDto.shareCatalogProducts.find((p) => p.productId === product.id)?.price || 0,
          visibility: "published",
        };
        
        productData.price = productData.price * 100;
        return this.catalogService.updateProduct(product.catalogId, productData);
      })
    );

    const shareCatalog = this.prismaService.shareCatalog.create({
      data: {
        catalogId: createShareCatlaogDto.catalogId,
        publishDate: createShareCatlaogDto.publishDate,
        publishTime: createShareCatlaogDto.publishTime,
        ShareCatalogProducts: {
          createMany: {
            data: createShareCatlaogDto.shareCatalogProducts.map((product) => ({
              productId: product.productId,
              qnty: product.qnty,
              qntyUnit: product.qntyUnit,
              price: product.price,
              productCatalogId: product.productCatalogId,
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

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.prismaService.shareCatalog.count({}),
      this.prismaService.shareCatalog.findMany({
        orderBy: {
          createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
        },
        include: {
          ShareCatalogProducts: {
            include: { product: { include: { category: true } } },
          },
          catalog: true,
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  update(id: string, updateShareCatlaogDto: UpdateShareCatlaogDto) {
    return { id, ...updateShareCatlaogDto };
  }

  remove(id: string) {
    return `This action removes a #${id} shareCatlaog`;
  }

}
