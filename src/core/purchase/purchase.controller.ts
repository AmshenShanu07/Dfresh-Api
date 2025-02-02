import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CleaningDetailsDto } from './dto/cleaning-details.dto';
import { ThresholdLevelDto } from './dto/thereshold-level.dto';

@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post('/create')
  create(@Body() createPurchaseDto: CreatePurchaseDto) {
    return this.purchaseService.create(createPurchaseDto);
  }

  @Get('all')
  findAll() {
    return this.purchaseService.findAll();
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.purchaseService.findOne(id);
  }

  @Put('cleaning-details/:id')
  addCleaningDetails(
    @Param('id') id: string,
    @Body() cleaningDetailsDto: CleaningDetailsDto,
  ) {
    return this.purchaseService.addCleaningDetails(id, cleaningDetailsDto);
  }

  @Put('add-threshold/:id')
  addThreshold(
    @Param('id') id: string,
    @Body() thresholdLevel: ThresholdLevelDto,
  ) {
    return this.purchaseService.addThreshold(id, thresholdLevel);
  }

  @Delete('delete:id')
  remove(@Param('id') id: string) {
    return this.purchaseService.remove(id);
  }
}
