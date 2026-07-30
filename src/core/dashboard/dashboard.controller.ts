import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** Headline stat cards for the admin overview. */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('summary')
  getSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSummary(query.range ?? 'today');
  }

  /**
   * Sell-through of the live (or most recently opened) share catalog.
   * Not period-scoped — it describes the current catalog window.
   */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('stock-status')
  getStockStatus() {
    return this.dashboardService.getStockStatus();
  }

  /** Products ranked by quantity sold in the period, plus category chips. */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('top-selling')
  getTopSelling(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getTopSelling(query.range ?? 'today');
  }
}
