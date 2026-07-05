import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CuttingStyle } from './entities/cutting-style.entity';
import { CreateCuttingStyleDto } from './dto/create-cutting-style.dto';
import { UpdateCuttingStyleDto } from './dto/update-cutting-style.dto';
import { CuttingStyleFilterDto } from './dto/filter-list.dto';

@Injectable()
export class CuttingStyleService {
  constructor(
    @InjectRepository(CuttingStyle)
    private readonly cuttingStyleRepository: Repository<CuttingStyle>,
  ) {}

  async create(dto: CreateCuttingStyleDto) {
    const existing = await this.cuttingStyleRepository.findOne({
      where: { name: ILike(dto.name), isDeleted: false },
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

  findAll() {
    return this.cuttingStyleRepository.find({
      where: { isDeleted: false },
      order: { name: 'ASC' },
    });
  }

  findAllActive() {
    return this.cuttingStyleRepository.find({
      where: { isActive: true, isDeleted: false },
      order: { name: 'ASC' },
    });
  }

  async filterList(filter: CuttingStyleFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.cuttingStyleRepository.count({ where: { isDeleted: false } }),
      this.cuttingStyleRepository.find({
        where: { isDeleted: false },
        order: {
          [filter.sortBy]: filter.sortOrder === -1 ? 'ASC' : 'DESC',
        },
        take: takeCount,
        skip: skipCount,
      }),
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
        where: { name: ILike(dto.name), isDeleted: false },
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
