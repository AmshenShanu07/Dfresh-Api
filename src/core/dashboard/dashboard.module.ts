import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { OrderDetails, OrderItems } from '../order/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { Category } from '../category/entities/category.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../share-catlaog/entities/share-catalog-product-stock.entity';

/**
 * `User` in forFeature and `JwtService` in providers are both required by
 * UserAuthGuard — omitting either fails at runtime with
 * `"UserRepository" at index [1] is available in the DashboardModule context`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderDetails,
      OrderItems,
      User,
      Products,
      ProductVariant,
      Category,
      Outlets,
      ShareCatalog,
      ShareCatalogProductStock,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, JwtService],
})
export class DashboardModule {}
