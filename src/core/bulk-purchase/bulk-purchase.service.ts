import { Injectable } from '@nestjs/common';
import { CreateBulkPurchaseDto } from './dto/create-bulk-purchase.dto';
import { UpdateBulkPurchaseDto } from './dto/update-bulk-purchase.dto';

@Injectable()
export class BulkPurchaseService {
  create(createBulkPurchaseDto: CreateBulkPurchaseDto) {
    return 'This action adds a new bulkPurchase';
  }

  findAll() {
    return `This action returns all bulkPurchase`;
  }

  findOne(id: number) {
    return `This action returns a #${id} bulkPurchase`;
  }

  update(id: number, updateBulkPurchaseDto: UpdateBulkPurchaseDto) {
    return `This action updates a #${id} bulkPurchase`;
  }

  remove(id: number) {
    return `This action removes a #${id} bulkPurchase`;
  }
}
