import { Injectable } from '@nestjs/common';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { Products } from '../product/entities/product.entity';

@Injectable()
export class ShareCatlaogService {
  constructor(
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    @InjectRepository(ShareCatalogProducts)
    private readonly shareCatalogProductsRepository: Repository<ShareCatalogProducts>,
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createShareCatlaogDto: CreateShareCatlaogDto) {
    const currentCatalog = await this.shareCatalogRepository.findOne({
      where: { isActive: true, isDeleted: false },
      relations: { ShareCatalogProducts: true },
    });

    if (currentCatalog) {
      await Promise.all(
        currentCatalog.ShareCatalogProducts.map((product) =>
          this.catalogService.updateProduct(product.productCatalogId, {
            availability: 'out of stock',
          }),
        ),
      );
    }

    await this.shareCatalogRepository.update(
      { isActive: true, isDeleted: false },
      { isActive: false },
    );

    const productsList = await this.productRepository.find({
      where: createShareCatlaogDto.shareCatalogProducts.map((p) => ({
        id: p.productId,
      })),
    });

    await Promise.all(
      productsList.map((product) => {
        const shareCatalogProduct = createShareCatlaogDto.shareCatalogProducts.find(
          (p) => p.productId === product.id,
        );
        const productData: MetaUpdateCatalogProductDto = {
          availability: 'in stock',
          price: (shareCatalogProduct?.price ?? 0) * 100,
          visibility: 'published',
        };
        return this.catalogService.updateProduct(product.catalogId, productData);
      }),
    );

    const shareCatalog = await this.shareCatalogRepository.save(
      this.shareCatalogRepository.create({
        catalogId: createShareCatlaogDto.catalogId,
        publishDate: createShareCatlaogDto.publishDate,
        publishTime: createShareCatlaogDto.publishTime,
      }),
    );

    await this.shareCatalogProductsRepository.save(
      createShareCatlaogDto.shareCatalogProducts.map((product) =>
        this.shareCatalogProductsRepository.create({
          shareCatalogId: shareCatalog.id,
          productId: product.productId,
          qnty: product.qnty,
          qntyUnit: product.qntyUnit,
          price: product.price,
          productCatalogId: product.productCatalogId,
        }),
      ),
    );

    return this.shareCatalogRepository.findOne({
      where: { id: shareCatalog.id },
      relations: { ShareCatalogProducts: { product: true }, catalog: true },
    });
  }

  findAll() {
    return this.shareCatalogRepository.find({
      relations: { ShareCatalogProducts: { product: true }, catalog: true },
    });
  }

  findOne(id: string) {
    return this.shareCatalogRepository.findOne({
      where: { id },
      relations: { ShareCatalogProducts: { product: true }, catalog: true },
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
          ShareCatalogProducts: { product: { category: true } },
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
