import {
  Controller,
  Get,
  Patch,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { UserAuthGuard } from 'src/guards/user.guard';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import { OrderStatus } from 'src/common/enums';

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

  @Put(':id/details')
  async updateOrderDetails(
    @Param('id') id: string,
    @Body() body: UpdateOrderDetailsDto,
  ) {
    const result = await this.orderService.updateOrderDetails(id, body);
    if (!result?.order) {
      return { success: false, message: 'Order not found' };
    }

    const { order, statusChanged } = result;

    // Notify the customer only when the status actually changed to one of the
    // customer-facing milestones, so re-saving does not re-send messages.
    const notifiable =
      order.status === OrderStatus.CONFIRMED ||
      order.status === OrderStatus.DISPATCHED;
    if (statusChanged && notifiable) {
      const customerPhone = order.user?.phone ?? order.deliveryDetails?.phone;
      if (customerPhone) {
        await this.whatsappService.sendOrderStatusUpdateMessage(
          customerPhone,
          order,
        );
      }
    }

    return order;
  }
}
