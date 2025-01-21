import { Module } from '@nestjs/common';
import { UsersModule } from './core/users/users.module';
import { BulkPurchaseModule } from './core/bulk-purchase/bulk-purchase.module';
import { OutletModule } from './core/outlet/outlet.module';
import { CategoryModule } from './core/category/category.module';
import { ProductModule } from './core/product/product.module';

@Module({
  imports: [UsersModule, BulkPurchaseModule, OutletModule, CategoryModule, ProductModule],
})
export class AppModule {}
