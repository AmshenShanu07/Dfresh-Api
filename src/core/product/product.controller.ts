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
import { CreateProductVariantDto, UpdateProductVariantDto } from './dto/create-product-variant.dto';
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

  // Variant endpoints
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post(':productId/variant')
  createVariant(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.productService.createVariant(productId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get(':productId/variants')
  findVariants(@Param('productId') productId: string) {
    return this.productService.findVariants(productId);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('variant/:variantId')
  updateVariant(
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productService.updateVariant(variantId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('variant/:variantId')
  deleteVariant(@Param('variantId') variantId: string) {
    return this.productService.deleteVariant(variantId);
  }
}
