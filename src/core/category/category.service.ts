import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryFilterDto } from './dto/filter-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Raw, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { likeContains } from 'src/common/utils/search';

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

  async getList(filter: CategoryFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    // One `where` shared by the count and the find: filtering only the find
    // would leave `total` at the unfiltered figure and the pager would offer
    // pages that come back empty.
    const where: FindOptionsWhere<Category> = { isDeleted: false };
    if (filter.search?.trim()) {
      // `name` is jsonb — Postgres has no ILIKE for jsonb, so match against
      // the English/Malayalam text inside it instead of the column directly.
      where.name = Raw(
        (alias) => `(${alias}->>'en' ILIKE :search OR ${alias}->>'ml' ILIKE :search)`,
        { search: likeContains(filter.search) },
      );
    }
    // `!== undefined`, not truthiness — `false` is a real filter value.
    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    }

    const [total, data] = await Promise.all([
      this.categoryRepository.count({ where }),
      this.categoryRepository.find({
        where,
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
