import { Module } from '@nestjs/common';
import { UsersModule } from './core/users/users.module';
import { OutletModule } from './core/outlet/outlet.module';
import { CategoryModule } from './core/category/category.module';
import { ProductModule } from './core/product/product.module';
import { PurchaseModule } from './core/purchase/purchase.module';
import { SupplierModule } from './core/supplier/supplier.module';
import { CatlogModule } from './core/catlog/catlog.module';

@Module({
  imports: [
    UsersModule,
    OutletModule,
    CategoryModule,
    ProductModule,
    PurchaseModule,
    SupplierModule,
    CatlogModule,
  ],
})
export class AppModule {}
