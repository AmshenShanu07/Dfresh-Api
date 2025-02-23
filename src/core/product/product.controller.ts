import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.productService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.productService.getList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('update/:id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(id, updateProductDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('delete/:id')
  softDelete(@Param('id') id: string) {
    return this.productService.softDelete(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.productService.hardDelete(id);
  }
}
