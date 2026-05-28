import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { UserAuthGuard } from 'src/guards/user.guard';

@Controller('order')
@UseGuards(UserAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('list')
  findAll(
    @Query('pageNumber') pageNumber: number,
    @Query('count') count: number,
    @Query('status') status: string,
  ) {
    return this.orderService.findAll({ pageNumber, count, status });
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Patch('confirm/:id')
  confirmOrder(@Param('id') id: string) {
    return this.orderService.confirmOrder(id);
  }

  @Patch('cancel/:id')
  cancelOrder(@Param('id') id: string) {
    return this.orderService.cancelOrder(id);
  }
}
