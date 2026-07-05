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
import { WardService } from './ward.service';
import { CreateWardDto } from './dto/create-ward.dto';
import { UpdateWardDto } from './dto/update-ward.dto';
import { WardFilterDto } from './dto/filter-list.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('ward')
export class WardController {
  constructor(private readonly wardService: WardService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() dto: CreateWardDto) {
    return this.wardService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.wardService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: WardFilterDto) {
    return this.wardService.filterList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.wardService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('/update/:id')
  update(@Param('id') id: string, @Body() dto: UpdateWardDto) {
    return this.wardService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('/delete/:id')
  softDelete(@Param('id') id: string) {
    return this.wardService.softDelete(id);
  }
}
