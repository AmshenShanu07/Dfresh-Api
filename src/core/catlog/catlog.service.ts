import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateCatlogDto } from './dto/create-catlog.dto';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { UpdateCatlogDto } from './dto/update-catlog.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from './entities/catalog.entity';
import { CatalogProducts } from './entities/catalog-products.entity';

@Injectable()
export class CatlogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
    @InjectRepository(CatalogProducts)
    private readonly catalogProductsRepository: Repository<CatalogProducts>,
  ) {}

  async create(createCatlogDto: CreateCatlogDto) {
    const catalog = await this.catalogRepository.save(
      this.catalogRepository.create({
        name: createCatlogDto.name,
        description: createCatlogDto.description,
      }),
    );

    await Promise.all(
      createCatlogDto.products.map((product) =>
        this.catalogProductsRepository.save(
          this.catalogProductsRepository.create({
            productId: product.productId,
            catalogId: catalog.id,
            productCatalogId: product.productCatalogId,
          }),
        ),
      ),
    );

    return this.findOne(catalog.id);
  }

  findAll() {
    return this.catalogRepository.find({
      where: { isDeleted: false },
      relations: { CatalogProducts: { product: true } },
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
      relations: { CatalogProducts: { product: true } },
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
        relations: { CatalogProducts: { product: { category: true } } },
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
      relations: { product: { category: true } },
    });
  }

  async removeProduct(data: RemoveCatlogProductDto) {
    const catalog = await this.catalogRepository.findOne({
      where: { id: data.catlogId },
    });

    if (!catalog) {
      return new BadRequestException('Catalog not found');
    }

    await this.catalogProductsRepository.delete({
      catalogId: catalog.id,
      productId: data.productId,
    });

    return this.findOne(catalog.id);
  }

  async update(id: string, updateCatlogDto: UpdateCatlogDto) {
    await this.catalogProductsRepository.delete({ catalogId: id });

    await Promise.all(
      updateCatlogDto.products.map((product) =>
        this.catalogProductsRepository.save(
          this.catalogProductsRepository.create({
            productId: product.productId,
            catalogId: id,
            productCatalogId: product.productCatalogId,
          }),
        ),
      ),
    );

    await this.catalogRepository.update(id, {
      name: updateCatlogDto.name,
      description: updateCatlogDto.description,
    });

    return this.catalogRepository.findOne({ where: { id } });
  }

  softDelete(id: string) {
    return this.catalogRepository.update(id, { isDeleted: true });
  }

  hardDelete(id: string) {
    return this.catalogRepository.delete(id);
  }
}
