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
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('create')
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @Get('all')
  findAll() {
    return this.productService.findAll();
  }

  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.productService.getList(filter);
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Put('update/:id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete('delete/:id')
  softDelete(@Param('id') id: string) {
    return this.productService.softDelete(id);
  }

  @Delete('hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.productService.hardDelete(id);
  }
}
