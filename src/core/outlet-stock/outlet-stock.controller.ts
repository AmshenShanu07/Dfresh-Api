import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';
import { OutletStockService } from './outlet-stock.service';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { positiveIntOr } from 'src/common/utils/pagination';

@Controller('outlet-stock')
export class OutletStockController {
  constructor(private readonly outletStockService: OutletStockService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('grid')
  getGrid() {
    return this.outletStockService.getGrid();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('transfer')
  transfer(@Body() transferStockDto: TransferStockDto) {
    return this.outletStockService.transfer(
      transferStockDto,
      transferStockDto.movedByUserId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('transfers')
  listTransfers(
    @Query('outletId') outletId?: string,
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.outletStockService.listTransfers({
      outletId,
      productId,
      page: positiveIntOr(page, 1),
      limit: positiveIntOr(limit, 20),
    });
  }
}
