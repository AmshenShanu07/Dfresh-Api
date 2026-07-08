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

  findAll() {
    return this.wardRepository.find({
      where: { isDeleted: false },
      order: { localBodyName: 'ASC', wardNumber: 'ASC' },
    });
  }

  findAllActive() {
    return this.wardRepository.find({
      where: { isActive: true, isDeleted: false },
      order: { localBodyName: 'ASC', wardNumber: 'ASC' },
    });
  }

  async filterList(filter: WardFilterDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    const [total, data] = await Promise.all([
      this.wardRepository.count({ where: { isDeleted: false } }),
      this.wardRepository.find({
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
