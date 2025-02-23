import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Controller('supplier')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post('create')
  create(@Body() createSupplierDto: CreateSupplierDto) {
    return this.supplierService.create(createSupplierDto);
  }

  @Get('all')
  findAll() {
    return this.supplierService.findAll();
  }

  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.supplierService.getList(filter);
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.supplierService.findOne(id);
  }

  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(id, updateSupplierDto);
  }

  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.supplierService.remove(id);
  }
}
