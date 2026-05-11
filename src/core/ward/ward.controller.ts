import { Controller, Get, Param, Put, Delete, Body, UseGuards } from '@nestjs/common';
import { WardService } from './ward.service';
import { UpdateWardDto } from './dto/update-ward.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('ward')
export class WardController {
  constructor(private readonly wardService: WardService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.wardService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.wardService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWardDto) {
    return this.wardService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.wardService.remove(id);
  }
}
