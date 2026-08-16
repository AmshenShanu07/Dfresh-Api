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
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { CleaningDetailsDto } from './dto/cleaning-details.dto';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';
import { RolesGuard } from 'src/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserTypes } from 'src/common/enums';

@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('/create')
  create(@Body() createPurchaseDto: CreatePurchaseDto) {
    return this.purchaseService.create(createPurchaseDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.purchaseService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.purchaseService.getList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.purchaseService.findOne(id);
  }

  @ApiBearerAuth()
  @Roles(UserTypes.ADMIN, UserTypes.PURCHASE_STAFF)
  @UseGuards(UserAuthGuard, RolesGuard)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePurchaseDto: UpdatePurchaseDto,
  ) {
    return this.purchaseService.update(id, updatePurchaseDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('cleaning-details/:id')
  addCleaningDetails(
    @Param('id') id: string,
    @Body() cleaningDetailsDto: CleaningDetailsDto,
  ) {
    return this.purchaseService.addCleaningDetails(id, cleaningDetailsDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('add-threshold/:id')
  addThreshold(
    @Param('id') id: string,
    @Body() thresholdLevel: ThresholdLevelDto,
  ) {
    return this.purchaseService.addThreshold(id, thresholdLevel);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('delete:id')
  remove(@Param('id') id: string) {
    return this.purchaseService.remove(id);
  }
}
