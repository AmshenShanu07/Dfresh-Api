import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BulkPurchaseService } from './bulk-purchase.service';
import { CreateBulkPurchaseDto } from './dto/create-bulk-purchase.dto';
import { UpdateBulkPurchaseDto } from './dto/update-bulk-purchase.dto';

@Controller('bulk-purchase')
export class BulkPurchaseController {
  constructor(private readonly bulkPurchaseService: BulkPurchaseService) {}

  @Post()
  create(@Body() createBulkPurchaseDto: CreateBulkPurchaseDto) {
    return this.bulkPurchaseService.create(createBulkPurchaseDto);
  }

  @Get()
  findAll() {
    return this.bulkPurchaseService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bulkPurchaseService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBulkPurchaseDto: UpdateBulkPurchaseDto) {
    return this.bulkPurchaseService.update(+id, updateBulkPurchaseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bulkPurchaseService.remove(+id);
  }
}
