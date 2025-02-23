import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatlogService } from './catlog.service';
import { CreateCatlogDto } from './dto/create-catlog.dto';
import { ShareCatlogDto } from './dto/share-catlog.dto';
import { RemoveCatlogProductDto } from '../category/dto/remove-product.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('catlog')
export class CatlogController {
  constructor(private readonly catlogService: CatlogService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() createCatlogDto: CreateCatlogDto) {
    return this.catlogService.create(createCatlogDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.catlogService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.catlogService.getList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.catlogService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('share/:id')
  shareCatlog(@Body() shareCatlogDto: ShareCatlogDto) {
    return this.catlogService.shareCatlog(shareCatlogDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('remove-product')
  removeProduct(@Query() data: RemoveCatlogProductDto) {
    return this.catlogService.removeProduct(data);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('delete/:id')
  softDelete(@Param('id') id: string) {
    return this.catlogService.softDelete(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.catlogService.softDelete(id);
  }
}
