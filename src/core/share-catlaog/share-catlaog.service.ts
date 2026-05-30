import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';

@Injectable()
export class ShareCatlaogService {
  constructor(
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ShareCatalogProducts)
    private readonly shareCatalogProductsRepository: Repository<ShareCatalogProducts>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createShareCatlaogDto: CreateShareCatlaogDto) {
    const previous = await this.shareCatalogRepository.findOne({
      where: { isActive: true, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });

    if (previous) {
      if (previous.isPublished) {
        await this.closeCatalogMeta(previous);
      }
      previous.isActive = false;
      previous.isPublished = false;
      await this.shareCatalogRepository.save(previous);
    }

    const variantIds = createShareCatlaogDto.shareCatalogProducts.map((p) => p.variantId);
    const variants = await this.variantRepository.findByIds(variantIds);
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const shareCatalog = await this.shareCatalogRepository.save(
      this.shareCatalogRepository.create({
        catalogId: createShareCatlaogDto.catalogId,
        daysOfWeek: createShareCatlaogDto.daysOfWeek,
        startTime: createShareCatlaogDto.startTime,
        endTime: createShareCatlaogDto.endTime,
        isActive: true,
        isPublished: false,
        // Gate against firing for an already-open window at creation time;
        // cron requires the next windowStart to exceed this timestamp.
        lastWindowOpenedAt: new Date(),
      }),
    );

    await this.shareCatalogProductsRepository.save(
      createShareCatlaogDto.shareCatalogProducts.map((product) => {
        const variant = variantMap.get(product.variantId);
        return this.shareCatalogProductsRepository.create({
          shareCatalogId: shareCatalog.id,
          productId: product.productId,
          variantId: product.variantId,
          qnty: product.qnty,
          qntyUnit: product.qntyUnit,
          price: product.price,
          productCatalogId: variant?.metaProductId ?? product.productCatalogId ?? '',
        });
      }),
    );

    return this.shareCatalogRepository.findOne({
      where: { id: shareCatalog.id },
      relations: { ShareCatalogProducts: { product: true, variant: true }, catalog: true },
    });
  }

  async setActive(id: string, active: boolean) {
    const catalog = await this.shareCatalogRepository.findOne({
      where: { id, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });
    if (!catalog) {
      throw new NotFoundException(`ShareCatalog ${id} not found`);
    }

    if (active) {
      const others = await this.shareCatalogRepository.find({
        where: { isActive: true, isDeleted: false },
        relations: { ShareCatalogProducts: true },
      });
      for (const other of others) {
        if (other.id === id) continue;
        if (other.isPublished) {
          await this.closeCatalogMeta(other);
        }
        other.isActive = false;
        other.isPublished = false;
        await this.shareCatalogRepository.save(other);
      }

      catalog.isActive = true;
      catalog.isPublished = false;
      catalog.lastWindowOpenedAt = new Date();
    } else {
      catalog.isActive = false;
      if (catalog.isPublished) {
        await this.closeCatalogMeta(catalog);
        catalog.isPublished = false;
      }
    }

    await this.shareCatalogRepository.save(catalog);
    return catalog;
  }

  async closeCatalogMeta(catalog: ShareCatalog) {
    const products = catalog.ShareCatalogProducts ?? [];
    await Promise.all(
      products
        .filter((scp: any) => scp.productCatalogId)
        .map((scp: any) =>
          this.catalogService.updateProduct(scp.productCatalogId, {
            availability: 'out of stock',
            visibility: 'hidden',
          }),
        ),
    );
    const variantIds = products
      .filter((scp: any) => scp.variantId)
      .map((scp: any) => scp.variantId);
    if (variantIds.length) {
      await this.variantRepository
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ isActive: false })
        .whereInIds(variantIds)
        .execute();
    }
  }

  findAll() {
    return this.shareCatalogRepository.find({
      relations: { ShareCatalogProducts: { product: true, variant: true }, catalog: true },
    });
  }

  findOne(id: string) {
    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: { ShareCatalogProducts: { product: true, variant: true }, catalog: true },
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
      this.shareCatalogRepository.count(),
      this.shareCatalogRepository.find({
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        relations: {
          ShareCatalogProducts: { product: { category: true }, variant: true },
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
