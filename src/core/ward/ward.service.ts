import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ward } from './entities/ward.entity';
import { CreateWardDto } from './dto/create-ward.dto';
import { UpdateWardDto } from './dto/update-ward.dto';
import { WardFilterDto } from './dto/filter-list.dto';

@Injectable()
export class WardService {
  constructor(
    @InjectRepository(Ward)
    private readonly wardRepository: Repository<Ward>,
  ) {}

  async create(dto: CreateWardDto) {
    const existing = await this.wardRepository.findOne({
      where: {
        localBodyId: dto.localBodyId,
        wardNumber: dto.wardNumber,
        isDeleted: false,
      },
    });

    if (existing) {
      throw new ConflictException(
        'A ward with this number already exists for this local body',
      );
    }

    const ward = await this.wardRepository.save(
      this.wardRepository.create({
        districtId: dto.districtId,
        districtName: dto.districtName,
        constituencyType: dto.constituencyType,
        localBodyId: dto.localBodyId,
        localBodyName: dto.localBodyName,
        wardNumber: dto.wardNumber,
        wardName: dto.wardName,
        isActive: dto.isActive ?? true,
      }),
    );

    return this.findOne(ward.id);
  }

  // `localBodyName`/`districtName`/`wardName` are jsonb — ordering on the
  // column directly sorts by its raw JSON representation rather than the
  // display text, so these order/sort on the English key specifically.
  findAll() {
    return this.wardRepository
      .createQueryBuilder('ward')
      .where('ward."isDeleted" = false')
      .orderBy('ward."localBodyName"->>\'en\'', 'ASC')
      .addOrderBy('ward."wardNumber"', 'ASC')
      .getMany();
  }

  findAllActive() {
    return this.wardRepository
      .createQueryBuilder('ward')
      .where('ward."isActive" = true')
      .andWhere('ward."isDeleted" = false')
      .orderBy('ward."localBodyName"->>\'en\'', 'ASC')
      .addOrderBy('ward."wardNumber"', 'ASC')
      .getMany();
  }

  async filterList(filter: WardFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const orderColumn =
      filter.sortBy === 'localBodyName'
        ? 'ward."localBodyName"->>\'en\''
        : `ward."${filter.sortBy}"`;

    const [total, data] = await Promise.all([
      this.wardRepository.count({ where: { isDeleted: false } }),
      this.wardRepository
        .createQueryBuilder('ward')
        .where('ward."isDeleted" = false')
        .orderBy(orderColumn, filter.sortOrder === -1 ? 'ASC' : 'DESC')
        .take(takeCount)
        .skip(skipCount)
        .getMany(),
    ]);

    return { total, data };
  }

  async findOne(id: string) {
    const ward = await this.wardRepository.findOne({ where: { id } });
    if (!ward) throw new NotFoundException('Ward not found');
    return ward;
  }

  async update(id: string, dto: UpdateWardDto) {
    await this.findOne(id);
    await this.wardRepository.update(id, dto);
    return this.findOne(id);
  }

  async softDelete(id: string) {
    await this.findOne(id);
    return this.wardRepository.update(id, { isDeleted: true });
  }
}
