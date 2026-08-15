import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { CuttingStyle } from './entities/cutting-style.entity';
import { CreateCuttingStyleDto } from './dto/create-cutting-style.dto';
import { UpdateCuttingStyleDto } from './dto/update-cutting-style.dto';
import { CuttingStyleFilterDto } from './dto/filter-list.dto';
import { quoteRawAlias } from '../../common/utils/localized-text';

/** Case-insensitive duplicate check against the English name — the identity a dashboard admin actually types against. */
function byEnglishName(name: string) {
  return Raw((alias) => `${quoteRawAlias(alias)}->>'en' ILIKE :name`, { name });
}

@Injectable()
export class CuttingStyleService {
  constructor(
    @InjectRepository(CuttingStyle)
    private readonly cuttingStyleRepository: Repository<CuttingStyle>,
  ) {}

  async create(dto: CreateCuttingStyleDto) {
    const existing = await this.cuttingStyleRepository.findOne({
      where: { name: byEnglishName(dto.name.en), isDeleted: false },
    });

    if (existing) {
      throw new ConflictException('A cutting style with this name already exists');
    }

    const style = await this.cuttingStyleRepository.save(
      this.cuttingStyleRepository.create({
        name: dto.name,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      }),
    );

    return this.findOne(style.id);
  }

  // A lowercase alias, not `cuttingStyle`: TypeORM does not quote raw
  // where/orderBy strings, so an unquoted mixed-case alias gets folded to
  // lowercase by Postgres and stops matching the (quoted) FROM-clause alias.
  findAll() {
    return this.cuttingStyleRepository
      .createQueryBuilder('style')
      .where('style."isDeleted" = false')
      .orderBy("style.name->>'en'", 'ASC')
      .getMany();
  }

  findAllActive() {
    return this.cuttingStyleRepository
      .createQueryBuilder('style')
      .where('style."isActive" = true')
      .andWhere('style."isDeleted" = false')
      .orderBy("style.name->>'en'", 'ASC')
      .getMany();
  }

  async filterList(filter: CuttingStyleFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    // `name` is jsonb — sorting on the column directly sorts by its raw JSON
    // representation rather than the display text, so 'name' sorts on the
    // English key specifically.
    const orderColumn =
      filter.sortBy === 'name' ? "style.name->>'en'" : `style."${filter.sortBy}"`;

    const [total, data] = await Promise.all([
      this.cuttingStyleRepository.count({ where: { isDeleted: false } }),
      this.cuttingStyleRepository
        .createQueryBuilder('style')
        .where('style."isDeleted" = false')
        .orderBy(orderColumn, filter.sortOrder === -1 ? 'ASC' : 'DESC')
        .take(takeCount)
        .skip(skipCount)
        .getMany(),
    ]);

    return { total, data };
  }

  async findOne(id: string) {
    const style = await this.cuttingStyleRepository.findOne({ where: { id } });
    if (!style) throw new NotFoundException('Cutting style not found');
    return style;
  }

  async update(id: string, dto: UpdateCuttingStyleDto) {
    await this.findOne(id);

    if (dto.name) {
      const existing = await this.cuttingStyleRepository.findOne({
        where: { name: byEnglishName(dto.name.en), isDeleted: false },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'A cutting style with this name already exists',
        );
      }
    }

    await this.cuttingStyleRepository.update(id, dto);
    return this.findOne(id);
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.cuttingStyleRepository.update(id, { isDeleted: true });
  }
}
