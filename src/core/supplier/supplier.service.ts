import { Injectable } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  create(createSupplierDto: CreateSupplierDto) {
    return this.supplierRepository.save(
      this.supplierRepository.create({
        name: createSupplierDto.name,
        supplierCode: createSupplierDto.supplierCode,
        phone: createSupplierDto.phone,
        email: createSupplierDto.email,
        address: createSupplierDto.address,
      }),
    );
  }

  findAll() {
    return this.supplierRepository.find();
  }

  getList(filter: FilterCommonDto) {
    let takeCount = parseInt(filter.count + '');
    let skipCount = (parseInt(filter.pageNumber + '') - 1) * takeCount;

    if (takeCount < 0 || skipCount < 0) {
      takeCount = undefined;
      skipCount = undefined;
    }

    return this.supplierRepository.find({
      order: {
        createdAt: filter.sortOrder === -1 ? 'ASC' : 'DESC',
      },
      take: takeCount,
      skip: skipCount,
    });
  }

  findOne(id: string) {
    return this.supplierRepository.findOne({ where: { id } });
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    await this.supplierRepository.update(id, {
      name: updateSupplierDto.name,
      supplierCode: updateSupplierDto.supplierCode,
      phone: updateSupplierDto.phone,
      email: updateSupplierDto.email,
      address: updateSupplierDto.address,
    });
    return this.supplierRepository.findOne({ where: { id } });
  }

  remove(id: string) {
    return this.supplierRepository.delete(id);
  }
}
