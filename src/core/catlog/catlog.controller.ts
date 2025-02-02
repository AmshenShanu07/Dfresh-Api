import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
} from '@nestjs/common';
import { CatlogService } from './catlog.service';
import { CreateCatlogDto } from './dto/create-catlog.dto';
import { ShareCatlogDto } from './dto/share-catlog.dto';

@Controller('catlog')
export class CatlogController {
  constructor(private readonly catlogService: CatlogService) {}

  @Post('create')
  create(@Body() createCatlogDto: CreateCatlogDto) {
    return this.catlogService.create(createCatlogDto);
  }

  @Get('all')
  findAll() {
    return this.catlogService.findAll();
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.catlogService.findOne(id);
  }

  @Put('share/:id')
  shareCatlog(@Body() shareCatlogDto: ShareCatlogDto) {
    return this.catlogService.shareCatlog(shareCatlogDto);
  }

  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.catlogService.remove(+id);
  }
}
