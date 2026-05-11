import { Module } from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatlaogController } from './share-catlaog.controller';
import { ShareCatalogCronService } from './share-catlaog.cron';
import { JwtService } from '@nestjs/jwt';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User } from '../users/entities/user.entity';
import { OrderDetails, OrderItems, DeliveryDetails } from '../order/entities/order.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { Category } from '../category/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShareCatalog,
      ShareCatalogProducts,
      Products,
      ProductVariant,
      User,
      OrderDetails,
      OrderItems,
      DeliveryDetails,
      Category,
    ]),
  ],
  controllers: [ShareCatlaogController],
  providers: [
    ShareCatlaogService,
    ShareCatalogCronService,
    JwtService,
    MetaCatalogService,
    WhatsappService,
    ProductService,
    OrderService,
  ],
})
export class ShareCatlaogModule {}
