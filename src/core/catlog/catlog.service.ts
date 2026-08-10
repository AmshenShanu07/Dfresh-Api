import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCatlogDto } from './dto/create-catlog.dto';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { UpdateCatlogDto } from './dto/update-catlog.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ENABLED_STATUSES } from 'src/common/enums';
import { Catalog } from './entities/catalog.entity';
import { CatalogProducts } from './entities/catalog-products.entity';
import { CatalogProductVariants } from './entities/catalog-product-variants.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';

@Injectable()
export class CatlogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
    @InjectRepository(CatalogProducts)
    private readonly catalogProductsRepository: Repository<CatalogProducts>,
    @InjectRepository(CatalogProductVariants)
    private readonly catalogProductVariantsRepository: Repository<CatalogProductVariants>,
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
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
      where: { id, isDeleted: false },
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

    // The count must carry the same filter as the find, or the page total
    // over-reports and the last page renders short.
    const [total, data] = await Promise.all([
      this.catalogRepository.count({ where: { isDeleted: false } }),
      this.catalogRepository.find({
        where: { isDeleted: false },
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

  async getCatalogProducts(id: string) {
    const catalog = await this.catalogRepository.findOne({
      where: { id, isDeleted: false },
      select: ['id'],
    });
    if (!catalog) return [];

    return this.catalogProductsRepository.find({
      where: { catalogId: id },
      relations: { product: { category: true }, catalogVariants: { variant: true } },
    });
  }

  async removeProduct(data: RemoveCatlogProductDto) {
    const catalog = await this.catalogRepository.findOne({
      where: { id: data.catlogId, isDeleted: false },
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
    // Guard before the rebuild below wipes the child rows of a deleted catalog.
    const catalog = await this.catalogRepository.findOne({
      where: { id, isDeleted: false },
      select: ['id'],
    });
    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

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

  /**
   * Hides a catalog from every list, dropdown and detail view without destroying
   * it or the order history hanging off its share catalogs.
   *
   * An ACTIVE/LIVE share catalog is actively selling this catalog, so it blocks
   * the delete outright. The remaining (INACTIVE/PAUSED) ones are hidden along
   * with it — leaving them behind would let an admin toggle one back On later
   * and push a deleted catalog live to customers.
   */
  async softDelete(id: string) {
    const catalog = await this.catalogRepository.findOne({
      where: { id, isDeleted: false },
    });
    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    const shareCatalogs = await this.shareCatalogRepository.find({
      where: { catalogId: id, isDeleted: false },
    });

    const blocking = shareCatalogs.filter((sc) =>
      ENABLED_STATUSES.includes(sc.status),
    );
    if (blocking.length) {
      const sc = blocking[0];
      throw new ConflictException(
        `Cannot delete: share catalog "${catalog.name}" ` +
          `(${sc.daysOfWeek.join(',')} ${sc.startTime}-${sc.endTime}) is ${sc.status}. ` +
          `Delete that share catalog first.`,
      );
    }

    if (shareCatalogs.length) {
      await this.shareCatalogRepository.update(
        { id: In(shareCatalogs.map((sc) => sc.id)) },
        { isDeleted: true },
      );
    }

    return this.catalogRepository.update(id, { isDeleted: true });
  }

  /**
   * Permanently deletes a catalog and its child rows. Blocked if any non-deleted
   * ShareCatalog still references it. No DB cascades exist, so children are cleaned
   * manually (variants -> products -> catalog), matching the `update`/`removeProduct`
   * pattern, plus the `_CatalogToShareCatalogProducts` join is detached first.
   */
  async hardDelete(id: string) {
    const catalog = await this.catalogRepository.findOne({
      where: { id },
      relations: { ShareCatalogProducts: true },
    });
    if (!catalog) {
      throw new BadRequestException('Catalog not found');
    }

    const referencingShareCatalogs = await this.shareCatalogRepository.count({
      where: { catalogId: id, isDeleted: false },
    });
    if (referencingShareCatalogs > 0) {
      throw new ConflictException(
        'Cannot delete: catalog is used by one or more share catalogs. Delete those first.',
      );
    }

    // Detach ManyToMany join (_CatalogToShareCatalogProducts) to avoid FK errors.
    if (catalog.ShareCatalogProducts?.length) {
      await this.catalogRepository
        .createQueryBuilder()
        .relation(Catalog, 'ShareCatalogProducts')
        .of(id)
        .remove(catalog.ShareCatalogProducts);
    }

    // Delete children in order: variants -> products.
    const catalogProducts = await this.catalogProductsRepository.find({
      where: { catalogId: id },
    });
    for (const cp of catalogProducts) {
      await this.catalogProductVariantsRepository.delete({ catalogProductId: cp.id });
    }
    await this.catalogProductsRepository.delete({ catalogId: id });

    return this.catalogRepository.delete(id);
  }
}
