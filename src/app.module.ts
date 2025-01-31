import { Module } from '@nestjs/common';
import { UsersModule } from './core/users/users.module';
import { OutletModule } from './core/outlet/outlet.module';
import { CategoryModule } from './core/category/category.module';
import { ProductModule } from './core/product/product.module';

@Module({
  imports: [UsersModule, OutletModule, CategoryModule, ProductModule],
})
export class AppModule {}
