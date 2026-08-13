import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Res,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { OrderService } from './order.service';
import { ManualOrderService } from './manual-order.service';
import { InvoiceService } from './invoice.service';
import { UserAuthGuard } from 'src/guards/user.guard';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { UpdateOrderDetailsDto } from './dto/update-order-details.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { OrderStatus, UserLanguage } from 'src/common/enums';
import { deriveOrderNumber } from './order-number.util';

@Controller('order')
@UseGuards(UserAuthGuard)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly whatsappService: WhatsappService,
    private readonly invoiceService: InvoiceService,
    private readonly manualOrderService: ManualOrderService,
  ) {}

  /**
   * `range` (today | yesterday | last7 | …) filters by IST calendar days;
   * `from`/`to` override it with explicit yyyy-MM-dd IST dates. `outletId`
   * filters by the ward the outlet serves, or use `unassigned` for orders with
   * no ward. `search` matches the order number (`DF-260727-A5953C`, its bare
   * tail, or a raw UUID fragment) as well as the customer's name and phone.
   * All filters are optional — omitting them yields the full list as before.
   *
   * These stay as individual @Query params rather than a DTO: with the global
   * ValidationPipe's transform, an absent numeric DTO field arrives as NaN
   * instead of undefined (see common/utils/pagination.ts).
   */
  @Get('list')
  findAll(
    @Query('pageNumber') pageNumber: number,
    @Query('count') count: number,
    @Query('status') status: string,
    @Query('range') range: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('outletId') outletId: string,
    @Query('search') search: string,
  ) {
    return this.orderService.findAll({
      pageNumber,
      count,
      status,
      range,
      from,
      to,
      outletId,
      search,
    });
  }

  /**
   * Everything the manual-order form's product picker needs in one call:
   * products → variants with cleaning charge, cutting styles, catalog price
   * prefill and current master stock.
   */
  @Get('manual/products')
  getManualOrderProducts() {
    return this.manualOrderService.getPickerProducts();
  }

  /**
   * Creates an admin-entered order. It lands CONFIRMED, so the bill goes out
   * the same way confirmOrder sends it. A send failure — a landline, a number
   * not on WhatsApp — must not fail a legitimately placed order, so it is
   * caught: the bill stays printable from the order list either way.
   */
  @Post('manual')
  async createManualOrder(@Body() body: CreateManualOrderDto) {
    const { orderId } = await this.manualOrderService.create(body);

    try {
      await this.whatsappService.sendOrderBill(orderId);
    } catch (error) {
      console.error('Manual order: bill send failed', orderId, error);
    }

    return this.orderService.findOne(orderId);
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Get(':id/delivery-agents')
  getDeliveryAgents(@Param('id') id: string) {
    return this.orderService.getDeliveryAgentsForOrder(id);
  }

  @Get(':id/bill')
  async printBill(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const order = await this.orderService.findOne(id);
    if (!order) throw new NotFoundException('Order not found');

    const pdf = await this.invoiceService.generateBill(
      order,
      order.user?.language ?? UserLanguage.EN,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bill-${deriveOrderNumber(order)}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Get(':id/items/:itemId/label')
  async printItemLabel(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const order = await this.orderService.findOne(id);
    if (!order) throw new NotFoundException('Order not found');

    const item = (order.orderItems || []).find((i: any) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    const pdf = await this.invoiceService.generateLabel(
      item,
      order,
      order.user?.language ?? UserLanguage.EN,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="label-${deriveOrderNumber(order)}.pdf"`,
    });
    return new StreamableFile(pdf);
  }

  @Patch('confirm/:id')
  async confirmOrder(@Param('id') id: string) {
    const result = await this.orderService.confirmOrder(id);
    await this.whatsappService.sendOrderBill(id);
    return result;
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

    // Verified payment confirms the order — send the bill PDF (idempotent).
    await this.whatsappService.sendOrderBill(id);

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

    // If this update confirmed the order, send the bill PDF (idempotent).
    if (statusChanged && order.status === OrderStatus.CONFIRMED) {
      await this.whatsappService.sendOrderBill(id);
    }

    return order;
  }
}
