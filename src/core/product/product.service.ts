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
import { ProductVariant, VariantCuttingStyle } from './entities/product-variant.entity';
import { Category } from '../category/entities/category.entity';
import { CUTTING_STYLES } from 'src/common/constants';
import { CuttingStyleDto } from './dto/create-product-variant.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(VariantCuttingStyle)
    private readonly cuttingStyleRepository: Repository<VariantCuttingStyle>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly catalogService: MetaCatalogService,
  ) {}

  /**
   * Validates a variant's cleaning/cutting config against its parent product
   * and the master cutting-style list. Throws BadRequestException on violation.
   */
  private validateVariantCharges(
    product: Products,
    cfg: {
      cleaning?: boolean;
      cutting?: boolean;
      cuttingStyles?: CuttingStyleDto[];
    },
  ) {
    if (cfg.cleaning && !product.cleaning) {
      throw new BadRequestException(
        'Variant cleaning requires the product to have cleaning enabled',
      );
    }
    if (cfg.cutting) {
      if (!product.cutting) {
        throw new BadRequestException(
          'Variant cutting requires the product to have cutting enabled',
        );
      }
      if (!cfg.cuttingStyles?.length) {
        throw new BadRequestException(
          'At least one cutting style is required when cutting is enabled',
        );
      }
      for (const cs of cfg.cuttingStyles) {
        if (!(CUTTING_STYLES as readonly string[]).includes(cs.style)) {
          throw new BadRequestException(`Invalid cutting style: ${cs.style}`);
        }
      }
    }
  }

  /** Replaces the active cutting styles for a variant with the given list. */
  private async saveCuttingStyles(
    variantId: string,
    cutting: boolean,
    cuttingStyles?: CuttingStyleDto[],
  ) {
    // Remove any existing styles, then insert the new set (only when cutting).
    await this.cuttingStyleRepository.delete({ variantId });
    if (cutting && cuttingStyles?.length) {
      await this.cuttingStyleRepository.save(
        cuttingStyles.map((cs) =>
          this.cuttingStyleRepository.create({
            variantId,
            style: cs.style,
            price: cs.price,
          }),
        ),
      );
    }
  }

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
        this.validateVariantCharges(product, variantDto);

        const weightInGrams = variantDto.unit === 'kg' ? variantDto.weight * 1000 : variantDto.weight;
        const displayWeight = `${variantDto.weight}${variantDto.unit}`;

        const variant = await this.variantRepository.save(
          this.variantRepository.create({
            productId: product.id,
            weight: weightInGrams,
            unit: variantDto.unit,
            cleaning: variantDto.cleaning ?? false,
            cleaningCharge: variantDto.cleaning ? variantDto.cleaningCharge ?? 0 : 0,
            cutting: variantDto.cutting ?? false,
          }),
        );

        await this.saveCuttingStyles(
          variant.id,
          variantDto.cutting ?? false,
          variantDto.cuttingStyles,
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

    this.validateVariantCharges(product, dto);

    const weightInGrams = dto.unit === 'kg' ? dto.weight * 1000 : dto.weight;
    const displayWeight = `${dto.weight}${dto.unit}`;

    const variant = await this.variantRepository.save(
      this.variantRepository.create({
        productId,
        weight: weightInGrams,
        unit: dto.unit,
        cleaning: dto.cleaning ?? false,
        cleaningCharge: dto.cleaning ? dto.cleaningCharge ?? 0 : 0,
        cutting: dto.cutting ?? false,
      }),
    );

    await this.saveCuttingStyles(variant.id, dto.cutting ?? false, dto.cuttingStyles);

    await this.catalogService.createVariant(
      variant.id,
      product.id,
      product.name,
      displayWeight,
      product.image?.[0] ?? '',
      product.category?.name,
    );

    return this.variantRepository.findOne({
      where: { id: variant.id },
      relations: { cuttingStyles: true },
    });
  }

  findVariants(productId: string) {
    return this.variantRepository.find({
      where: { productId, isDeleted: false },
      relations: { cuttingStyles: true },
      order: { createdAt: 'ASC' },
    });
  }

  async updateVariant(variantId: string, dto: UpdateProductVariantDto) {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: { product: true },
    });
    if (!variant) throw new BadRequestException('Variant not found');

    // Resolve the effective cleaning/cutting state for validation.
    const cleaning = dto.cleaning ?? variant.cleaning;
    const cutting = dto.cutting ?? variant.cutting;
    this.validateVariantCharges(variant.product, {
      cleaning,
      cutting,
      cuttingStyles: dto.cuttingStyles,
    });

    const updateData: Partial<ProductVariant> = {};
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.weight !== undefined) {
      const unit = dto.unit ?? variant.unit;
      updateData.weight = unit === 'kg' ? dto.weight * 1000 : dto.weight;
    }
    if (dto.cleaning !== undefined) updateData.cleaning = dto.cleaning;
    if (dto.cleaning === false) updateData.cleaningCharge = 0;
    else if (dto.cleaningCharge !== undefined) updateData.cleaningCharge = dto.cleaningCharge;
    if (dto.cutting !== undefined) updateData.cutting = dto.cutting;

    await this.variantRepository.update(variantId, updateData);

    // Rebuild cutting styles only when the caller supplied them or disabled cutting.
    if (dto.cutting === false) {
      await this.saveCuttingStyles(variantId, false);
    } else if (dto.cuttingStyles !== undefined) {
      await this.saveCuttingStyles(variantId, cutting, dto.cuttingStyles);
    }

    return this.variantRepository.findOne({
      where: { id: variantId },
      relations: { cuttingStyles: true },
    });
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
      relations: { variants: { cuttingStyles: true }, category: true },
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
