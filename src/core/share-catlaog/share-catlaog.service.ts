import { Injectable } from '@nestjs/common';
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
    // Deactivate previous active catalog on Meta (hide variants)
    const currentCatalog = await this.shareCatalogRepository.findOne({
      where: { isActive: true, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });

    if (currentCatalog) {
      await Promise.all(
        currentCatalog.ShareCatalogProducts.filter((p) => p.productCatalogId).map((product) =>
          this.catalogService.updateProduct(product.productCatalogId, {
            availability: 'out of stock',
            visibility: 'hidden',
          }),
        ),
      );
      await this.shareCatalogRepository.update(
        { isActive: true, isDeleted: false },
        { isActive: false },
      );
    }

    // Resolve productCatalogId (metaProductId) from each variant
    const variantIds = createShareCatlaogDto.shareCatalogProducts.map((p) => p.variantId);
    const variants = await this.variantRepository.findByIds(variantIds);
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // Create new ShareCatalog (isPublished=false — cron will activate at scheduled time)
    const shareCatalog = await this.shareCatalogRepository.save(
      this.shareCatalogRepository.create({
        catalogId: createShareCatlaogDto.catalogId,
        publishDate: createShareCatlaogDto.publishDate,
        publishTime: createShareCatlaogDto.publishTime,
        isPublished: false,
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
