import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderService } from './order.service';

/**
 * Cancels and releases stock for stale unconfirmed orders every 5 minutes.
 * The actual selection/exemption logic (skipping UPI orders awaiting admin
 * verification) lives in OrderService.expireStaleOrders().
 */
@Injectable()
export class OrderExpiryCronService {
  private readonly logger = new Logger(OrderExpiryCronService.name);

  constructor(private readonly orderService: OrderService) {}

  @Cron('*/5 * * * *')
  async expireStaleOrders() {
    try {
      const { cancelled } = await this.orderService.expireStaleOrders();
      if (cancelled > 0) {
        this.logger.log(`Expired ${cancelled} stale unconfirmed order(s)`);
      }
    } catch (error) {
      this.logger.error('Failed to expire stale orders', error as Error);
    }
  }
}
