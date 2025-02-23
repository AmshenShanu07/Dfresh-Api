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
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoryService.create(createCategoryDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/all')
  findAll() {
    return this.categoryService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.categoryService.getList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, updateCategoryDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('delete/:id')
  softDelete(@Param('id') id: string) {
    return this.categoryService.softDelete(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.categoryService.hardDelete(id);
  }
}
