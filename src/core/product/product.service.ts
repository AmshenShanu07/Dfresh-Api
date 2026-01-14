import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from 'src/services/prisma.service';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaCatalogProductDto, MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';


@Injectable()
export class ProductService {;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    const product = await this.prismaService.products.create({
      data: createProductDto,
    });

    const waData: MetaCatalogProductDto = {
      retailer_id: product.id,
      name: createProductDto.name,
      description: createProductDto.description,
      availability: "out of stock",
      condition: "new",
      price: 199 * 100,
      currency: "INR",
      url: "https://hectogon-global.vercel.app/",
      image_url: createProductDto.image[0],
      brand: "Dfresh",

    };

    await this.catalogService.createProduct(waData);

    return product;
  }

  findAll() {
    return this.prismaService.products.findMany({});
  }

  findOne(id: string) {
    return this.prismaService.products.findFirst({ where: { id } });
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.prismaService.products.count({ where: { isDeleted: false } }),
      this.prismaService.products.findMany({
        where: { isDeleted: false },
        include: { category: true },
        orderBy: {
          createdAt: filter.sortOrder === -1 ? 'asc' : 'desc',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.prismaService.products.update({
      where: { id },
      data: updateProductDto,
    });

    const waData: MetaUpdateCatalogProductDto = {
      name: updateProductDto.name,
      description: updateProductDto.description,
      image_url: updateProductDto.image[0],
      visibility: product.isActive ? "published" : "hidden",
    };

    await this.catalogService.updateProduct(product.catalogId, waData);

    return product;
  }

  softDelete(id: string) {
    return this.prismaService.products.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  hardDelete(id: string) {
    return this.prismaService.products.delete({ where: { id } });
  }
}
