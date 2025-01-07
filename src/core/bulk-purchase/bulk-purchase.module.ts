import { Module } from '@nestjs/common';
import { BulkPurchaseService } from './bulk-purchase.service';
import { BulkPurchaseController } from './bulk-purchase.controller';

@Module({
  controllers: [BulkPurchaseController],
  providers: [BulkPurchaseService],
})
export class BulkPurchaseModule {}
