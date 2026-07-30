import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { Products } from '../product/entities/product.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProductStock } from '../share-catlaog/entities/share-catalog-product-stock.entity';
import { Staff } from '../users/entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { JwtService } from '@nestjs/jwt';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AreaModule } from '../area/area.module';
import { OrderExpiryCronService } from './order-expiry.cron';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderDetails,
      OrderItems,
      DeliveryDetails,
      User,
      ProductVariant,
      Products,
      ShareCatalog,
      ShareCatalogProductStock,
      Staff,
      Outlets,
    ]),
    WhatsappModule,
    AreaModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, JwtService, OrderExpiryCronService, InvoiceService],
  exports: [OrderService],
})
export class OrderModule {}
