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
import { OutletService } from './outlet.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletFilterDto } from './dto/filter-list.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('outlet')
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() createOutletDto: CreateOutletDto) {
    return this.outletService.create(createOutletDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.outletService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: OutletFilterDto) {
    return this.outletService.filterList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.outletService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('/update/:id')
  update(@Param('id') id: string, @Body() updateOutletDto: UpdateOutletDto) {
    return this.outletService.update(id, updateOutletDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('/delete/:id')
  softDelete(@Param('id') id: string) {
    return this.outletService.softDelete(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('/hard-delete/:id')
  hardDelete(@Param('id') id: string) {
    return this.outletService.softDelete(id);
  }
}
