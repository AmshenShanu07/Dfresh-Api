import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { UserAuthGuard } from 'src/guards/user.guard';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Controller('order')
@UseGuards(UserAuthGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly whatsappService: WhatsappService,
  ) {}

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

  @Patch('verify-payment/:id')
  async verifyPayment(@Param('id') id: string) {
    const order = await this.orderService.verifyPayment(id);
    if (!order) {
      return { success: false, message: 'Order is not eligible for payment verification' };
    }

    const customerPhone = order.user?.phone ?? order.deliveryDetails?.phone;
    if (customerPhone) {
      await this.whatsappService.sendOrderConfirmationMessage(customerPhone, order);
    }

    return { success: true };
  }
}
