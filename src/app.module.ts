import { Module } from '@nestjs/common';
import { UsersModule } from './core/users/users.module';
import { OutletModule } from './core/outlet/outlet.module';
import { CategoryModule } from './core/category/category.module';
import { ProductModule } from './core/product/product.module';
import { PurchaseModule } from './core/purchase/purchase.module';
import { SupplierModule } from './core/supplier/supplier.module';
import { CatlogModule } from './core/catlog/catlog.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: './.env',
    }),
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
