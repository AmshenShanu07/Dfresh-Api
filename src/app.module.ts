import { Module } from '@nestjs/common';
import { UsersModule } from './core/users/users.module';
import { BulkPurchaseModule } from './core/bulk-purchase/bulk-purchase.module';
import { OutletModule } from './core/outlet/outlet.module';

@Module({
  imports: [UsersModule, BulkPurchaseModule, OutletModule],
})
export class AppModule {}
