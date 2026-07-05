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
import { CuttingStyleService } from './cutting-style.service';
import { CreateCuttingStyleDto } from './dto/create-cutting-style.dto';
import { UpdateCuttingStyleDto } from './dto/update-cutting-style.dto';
import { CuttingStyleFilterDto } from './dto/filter-list.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('cutting-style')
export class CuttingStyleController {
  constructor(private readonly cuttingStyleService: CuttingStyleService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() dto: CreateCuttingStyleDto) {
    return this.cuttingStyleService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.cuttingStyleService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('active')
  findAllActive() {
    return this.cuttingStyleService.findAllActive();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: CuttingStyleFilterDto) {
    return this.cuttingStyleService.filterList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.cuttingStyleService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('/update/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCuttingStyleDto) {
    return this.cuttingStyleService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('/delete/:id')
  softDelete(@Param('id') id: string) {
    return this.cuttingStyleService.softDelete(id);
  }
}
