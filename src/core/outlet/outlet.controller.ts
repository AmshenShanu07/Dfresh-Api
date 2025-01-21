import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { OutletService } from './outlet.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';

@Controller('outlet')
export class OutletController {
  constructor(private readonly outletService: OutletService) {}

  @Post('create')
  create(@Body() createOutletDto: CreateOutletDto) {
    return this.outletService.create(createOutletDto);
  }

  @Get('all')
  findAll() {
    return this.outletService.findAll();
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.outletService.findOne(id);
  }

  @Patch('/update/:id')
  update(@Param('id') id: string, @Body() updateOutletDto: UpdateOutletDto) {
    return this.outletService.update(id, updateOutletDto);
  }

  @Delete('/delete/:id')
  remove(@Param('id') id: string) {
    return this.outletService.remove(id);
  }
}
