import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  create(createCategoryDto: CreateCategoryDto) {
    return this.categoryRepository.save(
      this.categoryRepository.create(createCategoryDto),
    );
  }

  async findAll() {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .select(['category.id', 'category.name', 'category.isActive', 'category.isDeleted', 'category.createdAt'])
      .where('category.isActive = :isActive', { isActive: true })
      .andWhere('category.isDeleted = :isDeleted', { isDeleted: false })
      .loadRelationCountAndMap('category.productsCount', 'category.Products')
      .getMany();

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      isDeleted: c.isDeleted,
      createdAt: c.createdAt,
      _count: { Products: (c as any).productsCount ?? 0 },
    }));
  }

  async findOne(id: string) {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .select(['category.id', 'category.name', 'category.isActive', 'category.isDeleted', 'category.createdAt'])
      .where('category.id = :id', { id })
      .loadRelationCountAndMap('category.productsCount', 'category.Products')
      .getMany();

    const c = categories[0];
    if (!c) return null;

    return {
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      isDeleted: c.isDeleted,
      createdAt: c.createdAt,
      _count: { Products: (c as any).productsCount ?? 0 },
    };
  }

  async getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.categoryRepository.count({ where: { isDeleted: false } }),
      this.categoryRepository.find({
        where: { isDeleted: false },
        order: {
          createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
    ]);

    return { total, data };
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.categoryRepository.update(id, updateCategoryDto);
    return this.categoryRepository.findOne({ where: { id } });
  }

  softDelete(id: string) {
    return this.categoryRepository.update(id, { isDeleted: true });
  }

  hardDelete(id: string) {
    return this.categoryRepository.delete(id);
  }
}
