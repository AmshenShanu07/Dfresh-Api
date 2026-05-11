import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ward } from './entities/ward.entity';
import { UpdateWardDto } from './dto/update-ward.dto';

@Injectable()
export class WardService {
  constructor(
    @InjectRepository(Ward)
    private readonly wardRepository: Repository<Ward>,
  ) {}

  findAll() {
    return this.wardRepository.find({ order: { wardNumber: 'ASC' } });
  }

  async findOne(id: string) {
    const ward = await this.wardRepository.findOne({ where: { id } });
    if (!ward) throw new NotFoundException('Ward not found');
    return ward;
  }

  async update(id: string, dto: UpdateWardDto) {
    await this.wardRepository.update(id, dto);
    return this.findOne(id);
  }

  remove(id: string) {
    return this.wardRepository.delete(id);
  }
}
