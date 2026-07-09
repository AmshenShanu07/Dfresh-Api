import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  CreateProductVariantDto,
  UpdateProductVariantDto,
  CuttingStyleDto,
} from './dto/create-product-variant.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Products } from './entities/product.entity';
import {
  ProductVariant,
  VariantCuttingStyle,
} from './entities/product-variant.entity';
import { ProductCuttingStyle } from './entities/product-cutting-style.entity';
import { CuttingStyle } from '../cutting-style/entities/cutting-style.entity';
import { Category } from '../category/entities/category.entity';
import { MeasurementType } from 'src/common/enums';
import {
  toBase,
  isUnitInFamily,
  baseUnitFor,
  unitsFor,
  Unit,
} from 'src/common/utils/units';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Products)
    private readonly productRepository: Repository<Products>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(VariantCuttingStyle)
    private readonly variantCuttingStyleRepository: Repository<VariantCuttingStyle>,
    @InjectRepository(ProductCuttingStyle)
    private readonly productCuttingStyleRepository: Repository<ProductCuttingStyle>,
    @InjectRepository(CuttingStyle)
    private readonly cuttingStyleMasterRepository: Repository<CuttingStyle>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  // ---- Cutting-style helpers ------------------------------------------------

  /** Returns the subset of the given ids that are active, non-deleted master styles. */
  private async getActiveMasterStyleIds(ids: string[]): Promise<Set<string>> {
    if (!ids?.length) return new Set();
    const found = await this.cuttingStyleMasterRepository.find({
      where: { id: In(ids), isActive: true, isDeleted: false },
    });
    return new Set(found.map((s) => s.id));
  }

  /**
   * Validates and normalises the product-level cutting styles. Returns [] when
   * the product has cutting disabled; otherwise the deduped list of valid ids.
   */
  private async resolveProductStyleIds(
    cutting: boolean,
    cuttingStyleIds?: string[],
  ): Promise<string[]> {
    if (!cutting) return [];
    const ids = [...new Set(cuttingStyleIds ?? [])];
    if (!ids.length) return [];
    const activeIds = await this.getActiveMasterStyleIds(ids);
    const invalid = ids.filter((id) => !activeIds.has(id));
    if (invalid.length) {
      throw new BadRequestException(
        `Invalid or inactive cutting style id(s): ${invalid.join(', ')}`,
      );
    }
    return ids;
  }

  /** Ids of the cutting styles a product currently offers. */
  private async getProductStyleIds(productId: string): Promise<string[]> {
    const rows = await this.productCuttingStyleRepository.find({
      where: { productId, isDeleted: false },
    });
    return rows.map((r) => r.cuttingStyleId);
  }

  /** Every supplied variant price must reference a style the product offers. */
  private validateVariantCuttingStyles(
    productStyleIds: string[],
    cuttingStyles?: CuttingStyleDto[],
  ) {
    if (!cuttingStyles?.length) return;
    const allowed = new Set(productStyleIds);
    for (const cs of cuttingStyles) {
      if (!allowed.has(cs.cuttingStyleId)) {
        throw new BadRequestException(
          `Cutting style ${cs.cuttingStyleId} is not offered by this product`,
        );
      }
    }
  }

  /** Replaces the product's offered cutting styles with the given set. */
  private async saveProductCuttingStyles(productId: string, styleIds: string[]) {
    await this.productCuttingStyleRepository.delete({ productId });
    if (styleIds.length) {
      await this.productCuttingStyleRepository.save(
        styleIds.map((cuttingStyleId) =>
          this.productCuttingStyleRepository.create({ productId, cuttingStyleId }),
        ),
      );
    }
  }

  /**
   * Rebuilds a variant's per-style prices so it mirrors the product's styles.
   * A row is written for each product style, using the supplied price (or 0).
   */
  private async saveVariantCuttingStyles(
    variantId: string,
    productStyleIds: string[],
    cuttingStyles?: CuttingStyleDto[],
  ) {
    await this.variantCuttingStyleRepository.delete({ variantId });
    if (productStyleIds.length) {
      const priceMap = new Map(
        (cuttingStyles ?? []).map((cs) => [cs.cuttingStyleId, cs.price]),
      );
      await this.variantCuttingStyleRepository.save(
        productStyleIds.map((cuttingStyleId) =>
          this.variantCuttingStyleRepository.create({
            variantId,
            cuttingStyleId,
            price: priceMap.get(cuttingStyleId) ?? 0,
          }),
        ),
      );
    }
  }

  /**
   * Keeps every variant of a product in sync with the product's style set:
   * adds missing styles (price 0) and removes styles no longer offered, while
   * preserving prices for styles that remain.
   */
  private async syncVariantStylesForProduct(
    productId: string,
    styleIds: string[],
  ) {
    const variants = await this.variantRepository.find({
      where: { productId, isDeleted: false },
    });
    const target = new Set(styleIds);

    for (const variant of variants) {
      const existing = await this.variantCuttingStyleRepository.find({
        where: { variantId: variant.id },
      });
      const existingIds = new Set(existing.map((e) => e.cuttingStyleId));

      const toAdd = styleIds.filter((id) => !existingIds.has(id));
      if (toAdd.length) {
        await this.variantCuttingStyleRepository.save(
          toAdd.map((cuttingStyleId) =>
            this.variantCuttingStyleRepository.create({
              variantId: variant.id,
              cuttingStyleId,
              price: 0,
            }),
          ),
        );
      }

      const toRemove = existing
        .filter((e) => !target.has(e.cuttingStyleId))
        .map((e) => e.cuttingStyleId);
      if (toRemove.length) {
        await this.variantCuttingStyleRepository.delete({
          variantId: variant.id,
          cuttingStyleId: In(toRemove),
        });
      }
    }
  }

  // ---- Unit / measurement helpers ------------------------------------------

  /**
   * Validates that `unit` belongs to the product's measurement family, and that
   * COUNT amounts are whole numbers. Throws BadRequestException otherwise.
   */
  private validateUnitForType(
    measurementType: MeasurementType,
    unit: Unit,
    amount: number,
  ) {
    if (!isUnitInFamily(unit, measurementType)) {
      throw new BadRequestException(
        `Unit "${unit}" is not valid for a ${measurementType} product (allowed: ${unitsFor(
          measurementType,
        ).join(', ')})`,
      );
    }
    if (
      measurementType === MeasurementType.COUNT &&
      !Number.isInteger(Number(amount))
    ) {
      throw new BadRequestException('Count must be a whole number');
    }
  }

  /**
   * Remaps a display unit to the equivalent tier in a new measurement family
   * (large kg/l vs small g/ml). Used when a product's measurementType changes.
   */
  private remapUnitToFamily(oldUnit: Unit, newType: MeasurementType): Unit {
    if (newType === MeasurementType.COUNT) return 'count';
    const isLarge = ['kg', 'l'].includes(String(oldUnit).toLowerCase());
    // unitsFor returns [large, small] for WEIGHT/VOLUME.
    const [large, small] = unitsFor(newType);
    return isLarge ? large : small;
  }

  /**
   * Relabels every variant of a product to units valid for `newType`, keeping
   * the stored base amount (weight) unchanged. Called when measurementType flips.
   */
  private async relabelVariantsForType(
    productId: string,
    newType: MeasurementType,
  ) {
    const variants = await this.variantRepository.find({ where: { productId } });
    for (const v of variants) {
      const newUnit = this.remapUnitToFamily(v.unit, newType);
      if (newUnit !== v.unit) {
        await this.variantRepository.update(v.id, { unit: newUnit });
      }
    }
  }

  // ---- Product / variant CRUD ----------------------------------------------

  async create(createProductDto: CreateProductDto) {
    const cleaning = createProductDto.cleaning ?? false;
    const cutting = createProductDto.cutting ?? false;
    const measurementType =
      createProductDto.measurementType ?? MeasurementType.WEIGHT;

    let totalQuantity = 0;
    if (createProductDto.totalQuantity != null) {
      const stockUnit = (createProductDto.totalQuantityUnit ??
        baseUnitFor(measurementType)) as Unit;
      this.validateUnitForType(
        measurementType,
        stockUnit,
        createProductDto.totalQuantity,
      );
      totalQuantity = toBase(createProductDto.totalQuantity, stockUnit);
    }

    const product = await this.productRepository.save(
      this.productRepository.create({
        name: createProductDto.name,
        description: createProductDto.description,
        image: createProductDto.image,
        categoryId: createProductDto.categoryId,
        measurementType,
        cleaning,
        cutting,
        totalQuantity,
      }),
    );

    const styleIds = await this.resolveProductStyleIds(
      cutting,
      createProductDto.cuttingStyleIds,
    );
    await this.saveProductCuttingStyles(product.id, styleIds);

    if (createProductDto.variants?.length) {
      for (const variantDto of createProductDto.variants) {
        this.validateVariantCuttingStyles(styleIds, variantDto.cuttingStyles);
        this.validateUnitForType(
          measurementType,
          variantDto.unit,
          variantDto.weight,
        );

        const amountInBase = toBase(variantDto.weight, variantDto.unit);

        const variant = await this.variantRepository.save(
          this.variantRepository.create({
            productId: product.id,
            weight: amountInBase,
            unit: variantDto.unit,
            cleaningCharge: cleaning ? variantDto.cleaningCharge ?? 0 : 0,
          }),
        );

        await this.saveVariantCuttingStyles(
          variant.id,
          styleIds,
          variantDto.cuttingStyles,
        );
      }
    }

    return this.findOne(product.id);
  }

  async createVariant(productId: string, dto: CreateProductVariantDto) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });
    if (!product) throw new BadRequestException('Product not found');

    const styleIds = await this.getProductStyleIds(productId);
    this.validateVariantCuttingStyles(styleIds, dto.cuttingStyles);
    this.validateUnitForType(product.measurementType, dto.unit, dto.weight);

    const amountInBase = toBase(dto.weight, dto.unit);

    const variant = await this.variantRepository.save(
      this.variantRepository.create({
        productId,
        weight: amountInBase,
        unit: dto.unit,
        cleaningCharge: product.cleaning ? dto.cleaningCharge ?? 0 : 0,
      }),
    );

    await this.saveVariantCuttingStyles(variant.id, styleIds, dto.cuttingStyles);

    return this.variantRepository.findOne({
      where: { id: variant.id },
      relations: { cuttingStyles: { cuttingStyle: true } },
    });
  }

  findVariants(productId: string) {
    return this.variantRepository.find({
      where: { productId, isDeleted: false },
      relations: { cuttingStyles: { cuttingStyle: true } },
      order: { createdAt: 'ASC' },
    });
  }

  async updateVariant(variantId: string, dto: UpdateProductVariantDto) {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
      relations: { product: true },
    });
    if (!variant) throw new BadRequestException('Variant not found');

    const styleIds = await this.getProductStyleIds(variant.productId);
    this.validateVariantCuttingStyles(styleIds, dto.cuttingStyles);

    const measurementType = variant.product.measurementType;
    const updateData: Partial<ProductVariant> = {};
    if (dto.unit !== undefined) {
      this.validateUnitForType(
        measurementType,
        dto.unit,
        dto.weight ?? variant.weight,
      );
      updateData.unit = dto.unit;
    }
    if (dto.weight !== undefined) {
      const unit = dto.unit ?? variant.unit;
      this.validateUnitForType(measurementType, unit, dto.weight);
      updateData.weight = toBase(dto.weight, unit);
    }
    if (dto.cleaningCharge !== undefined) {
      updateData.cleaningCharge = variant.product.cleaning ? dto.cleaningCharge : 0;
    }

    if (Object.keys(updateData).length) {
      await this.variantRepository.update(variantId, updateData);
    }

    if (dto.cuttingStyles !== undefined) {
      await this.saveVariantCuttingStyles(variantId, styleIds, dto.cuttingStyles);
    }

    return this.variantRepository.findOne({
      where: { id: variantId },
      relations: { cuttingStyles: { cuttingStyle: true } },
    });
  }

  deleteVariant(variantId: string) {
    return this.variantRepository.update(variantId, { isDeleted: true });
  }

  findAll() {
    return this.productRepository.find({ where: { isDeleted: false } });
  }

  async findAllDetailed() {
    const [total, data] = await Promise.all([
      this.productRepository.count({ where: { isDeleted: false } }),
      this.productRepository.find({
        where: { isDeleted: false },
        relations: { category: true },
        order: { createdAt: 'DESC' },
      }),
    ]);

    return { total, data };
  }

  findOne(id: string) {
    return this.productRepository.findOne({
      where: { id },
      relations: {
        variants: { cuttingStyles: { cuttingStyle: true } },
        productCuttingStyles: { cuttingStyle: true },
        category: true,
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
      this.productRepository.count({ where: { isDeleted: false } }),
      this.productRepository.find({
        where: { isDeleted: false },
        relations: {
          category: true,
          variants: { cuttingStyles: { cuttingStyle: true } },
          productCuttingStyles: { cuttingStyle: true },
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

  async update(id: string, updateProductDto: UpdateProductDto) {
    const existing = await this.productRepository.findOne({ where: { id } });
    if (!existing) throw new BadRequestException('Product not found');

    // Stock is stored in the product's base unit; convert from the supplied
    // display unit. Strip fields that need special handling so they aren't
    // blindly assigned.
    const prevMeasurementType = existing.measurementType;
    const { totalQuantity, totalQuantityUnit, cuttingStyleIds, variants, ...rest } =
      updateProductDto;
    Object.assign(existing, rest);
    if (totalQuantity != null) {
      const stockUnit = (totalQuantityUnit ??
        baseUnitFor(existing.measurementType)) as Unit;
      this.validateUnitForType(existing.measurementType, stockUnit, totalQuantity);
      existing.totalQuantity = toBase(totalQuantity, stockUnit);
    }

    const product = await this.productRepository.save(existing);

    // If the measurement family changed, relabel existing variants so their unit
    // stays valid for the new family (keeps the stored base amount, remaps the
    // display tier: kg->l / g->ml / anything->count). Admin reviews amounts after.
    if (product.measurementType !== prevMeasurementType) {
      await this.relabelVariantsForType(product.id, product.measurementType);
    }

    // Resolve the product's target cutting styles and keep variants in sync.
    let targetStyleIds: string[];
    if (!product.cutting) {
      targetStyleIds = [];
    } else if (cuttingStyleIds !== undefined) {
      targetStyleIds = await this.resolveProductStyleIds(true, cuttingStyleIds);
    } else {
      targetStyleIds = await this.getProductStyleIds(product.id);
    }
    await this.saveProductCuttingStyles(product.id, targetStyleIds);
    await this.syncVariantStylesForProduct(product.id, targetStyleIds);

    // If cleaning was turned off, clear residual cleaning charges on variants.
    if (!product.cleaning) {
      await this.variantRepository.update(
        { productId: product.id },
        { cleaningCharge: 0 },
      );
    }

    return this.findOne(product.id);
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
