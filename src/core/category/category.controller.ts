import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post('create')
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @Get('/all')
  findAll() {
    return this.categoryService.findAll();
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @Delete('delete/:id')
  softDelete(@Param('id') id: string) {
    return this.categoryService.softDelete(id);
  }

  @Delete('hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.categoryService.hardDelete(id);
  }
}
