import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaCatalogProductDto, MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Products } from './entities/product.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    const product = await this.productRepository.save(
      this.productRepository.create(createProductDto),
    );

    const waData: MetaCatalogProductDto = {
      retailer_id: product.id,
      name: createProductDto.name,
      description: createProductDto.description,
      availability: 'out of stock',
      condition: 'new',
      price: 199 * 100,
      currency: 'INR',
      url: 'https://hectogon-global.vercel.app/',
      image_url: createProductDto.image[0],
      brand: 'Dfresh',
    };

    await this.catalogService.createProduct(waData);

    return product;
  }

  findAll() {
    return this.productRepository.find();
  }

  findOne(id: string) {
    return this.productRepository.findOne({ where: { id } });
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.productRepository.count({ where: { isDeleted: false } }),
      this.productRepository.find({
        where: { isDeleted: false },
        relations: { category: true },
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const existing = await this.productRepository.findOne({ where: { id } });
    Object.assign(existing, updateProductDto);
    const product = await this.productRepository.save(existing);

    const waData: MetaUpdateCatalogProductDto = {
      name: updateProductDto.name,
      description: updateProductDto.description,
      image_url: updateProductDto.image?.[0],
      visibility: product.isActive ? 'published' : 'hidden',
    };

    await this.catalogService.updateProduct(product.catalogId, waData);

    return product;
  }

  softDelete(id: string) {
    return this.productRepository.update(id, { isDeleted: true });
  }

  hardDelete(id: string) {
    return this.productRepository.delete(id);
  }

  async getRandomProductId() {
    const products = await this.productRepository.find({
      where: { isActive: true, isDeleted: false },
      select: ['id'],
    });

    if (!products || products.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * products.length);
    return products[randomIndex].id;
  }
}
