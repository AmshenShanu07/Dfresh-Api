import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateProductVariantDto, UpdateProductVariantDto } from './dto/create-product-variant.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { MetaUpdateCatalogProductDto } from 'src/common/dto/meta-catlog-product.dto';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Products } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Category } from '../category/entities/category.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly catalogService: MetaCatalogService,
  ) {}

  async create(createProductDto: CreateProductDto) {
    const product = await this.productRepository.save(
      this.productRepository.create({
        name: createProductDto.name,
        description: createProductDto.description,
        image: createProductDto.image,
        categoryId: createProductDto.categoryId,
        cleaning: createProductDto.cleaning ?? false,
        cutting: createProductDto.cutting ?? false,
      }),
    );

    const category = await this.categoryRepository.findOne({ where: { id: createProductDto.categoryId } });
    const categoryName = category?.name;

    if (createProductDto.variants?.length) {
      for (const variantDto of createProductDto.variants) {
        const weightInGrams = variantDto.unit === 'kg' ? variantDto.weight * 1000 : variantDto.weight;
        const displayWeight = `${variantDto.weight}${variantDto.unit}`;

        const variant = await this.variantRepository.save(
          this.variantRepository.create({
            productId: product.id,
            weight: weightInGrams,
            unit: variantDto.unit,
            cleaning: variantDto.cleaning ?? false,
            cutting: variantDto.cutting ?? false,
          }),
        );

        await this.catalogService.createVariant(
          variant.id,
          product.id,
          product.name,
          displayWeight,
          product.image?.[0] ?? '',
          categoryName,
        );
      }
    }

    return product;
  }

  async createVariant(productId: string, dto: CreateProductVariantDto) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: { category: true },
    });
    if (!product) throw new BadRequestException('Product not found');

    const weightInGrams = dto.unit === 'kg' ? dto.weight * 1000 : dto.weight;
    const displayWeight = `${dto.weight}${dto.unit}`;

    const variant = await this.variantRepository.save(
      this.variantRepository.create({
        productId,
        weight: weightInGrams,
        unit: dto.unit,
        cleaning: dto.cleaning ?? false,
        cutting: dto.cutting ?? false,
      }),
    );

    await this.catalogService.createVariant(
      variant.id,
      product.id,
      product.name,
      displayWeight,
      product.image?.[0] ?? '',
      product.category?.name,
    );

    return this.variantRepository.findOne({ where: { id: variant.id } });
  }

  findVariants(productId: string) {
    return this.variantRepository.find({
      where: { productId, isDeleted: false },
      order: { createdAt: 'ASC' },
    });
  }

  async updateVariant(variantId: string, dto: UpdateProductVariantDto) {
    const variant = await this.variantRepository.findOne({ where: { id: variantId } });
    if (!variant) throw new BadRequestException('Variant not found');

    const updateData: Partial<ProductVariant> = {};
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.weight !== undefined) {
      const unit = dto.unit ?? variant.unit;
      updateData.weight = unit === 'kg' ? dto.weight * 1000 : dto.weight;
    }

    await this.variantRepository.update(variantId, updateData);
    return this.variantRepository.findOne({ where: { id: variantId } });
  }

  deleteVariant(variantId: string) {
    return this.variantRepository.update(variantId, { isDeleted: true });
  }

  findAll() {
    return this.productRepository.find({ where: { isDeleted: false } });
  }

  findOne(id: string) {
    return this.productRepository.findOne({
      where: { id },
      relations: { variants: true, category: true },
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
      this.productRepository.count({ where: { isDeleted: false } }),
      this.productRepository.find({
        where: { isDeleted: false },
        relations: { category: true, variants: true },
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
