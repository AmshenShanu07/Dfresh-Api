import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCatlogDto } from './dto/create-catlog.dto';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { UpdateCatlogDto } from './dto/update-catlog.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from './entities/catalog.entity';
import { CatalogProducts } from './entities/catalog-products.entity';
import { CatalogProductVariants } from './entities/catalog-product-variants.entity';

@Injectable()
export class CatlogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
    @InjectRepository(CatalogProducts)
    private readonly catalogProductsRepository: Repository<CatalogProducts>,
    @InjectRepository(CatalogProductVariants)
    private readonly catalogProductVariantsRepository: Repository<CatalogProductVariants>,
  ) {}

  async create(createCatlogDto: CreateCatlogDto) {
    const catalog = await this.catalogRepository.save(
      this.catalogRepository.create({
        name: createCatlogDto.name,
        description: createCatlogDto.description,
      }),
    );

    for (const product of createCatlogDto.products) {
      const catalogProduct = await this.catalogProductsRepository.save(
        this.catalogProductsRepository.create({
          productId: product.productId,
          catalogId: catalog.id,
        }),
      );

      if (product.variants?.length) {
        await this.catalogProductVariantsRepository.save(
          product.variants.map((v) =>
            this.catalogProductVariantsRepository.create({
              catalogProductId: catalogProduct.id,
              variantId: v.variantId,
              price: v.price,
            }),
          ),
        );
      }
    }

    return this.findOne(catalog.id);
  }

  findAll() {
    return this.catalogRepository.find({
      where: { isDeleted: false },
      relations: {
        CatalogProducts: { product: true, catalogVariants: { variant: true } },
      },
    });
  }

  getAllCatlogDropDown() {
    return this.catalogRepository.find({
      where: { isDeleted: false },
      select: ['id', 'name'],
    });
  }

  findOne(id: string) {
    return this.catalogRepository.findOne({
      where: { id },
      relations: {
        CatalogProducts: { product: true, catalogVariants: { variant: true } },
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
      this.catalogRepository.count(),
      this.catalogRepository.find({
        relations: {
          CatalogProducts: {
            product: { category: true },
            catalogVariants: { variant: true },
          },
        },
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  getCatalogProducts(id: string) {
    return this.catalogProductsRepository.find({
      where: { catalogId: id },
      relations: { product: { category: true }, catalogVariants: { variant: true } },
    });
  }

  async removeProduct(data: RemoveCatlogProductDto) {
    const catalog = await this.catalogRepository.findOne({
      where: { id: data.catlogId },
    });

    if (!catalog) {
      return new BadRequestException('Catalog not found');
    }

    const catalogProduct = await this.catalogProductsRepository.findOne({
      where: { catalogId: catalog.id, productId: data.productId },
    });

    if (catalogProduct) {
      await this.catalogProductVariantsRepository.delete({ catalogProductId: catalogProduct.id });
      await this.catalogProductsRepository.delete(catalogProduct.id);
    }

    return this.findOne(catalog.id);
  }

  async update(id: string, updateCatlogDto: UpdateCatlogDto) {
    const existingProducts = await this.catalogProductsRepository.find({ where: { catalogId: id } });
    for (const cp of existingProducts) {
      await this.catalogProductVariantsRepository.delete({ catalogProductId: cp.id });
    }
    await this.catalogProductsRepository.delete({ catalogId: id });

    for (const product of updateCatlogDto.products) {
      const catalogProduct = await this.catalogProductsRepository.save(
        this.catalogProductsRepository.create({
          productId: product.productId,
          catalogId: id,
        }),
      );

      if (product.variants?.length) {
        await this.catalogProductVariantsRepository.save(
          product.variants.map((v) =>
            this.catalogProductVariantsRepository.create({
              catalogProductId: catalogProduct.id,
              variantId: v.variantId,
              price: v.price,
            }),
          ),
        );
      }
    }

    await this.catalogRepository.update(id, {
      name: updateCatlogDto.name,
      description: updateCatlogDto.description,
    });

    return this.findOne(id);
  }

  softDelete(id: string) {
    return this.catalogRepository.update(id, { isDeleted: true });
  }

  hardDelete(id: string) {
    return this.catalogRepository.delete(id);
  }
}
