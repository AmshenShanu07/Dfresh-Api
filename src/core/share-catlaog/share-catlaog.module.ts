import { Module } from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatlaogController } from './share-catlaog.controller';
import { ShareCatalogCronService } from './share-catlaog.cron';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { ShareCatalogProductStock } from './entities/share-catalog-product-stock.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User, UserAddress } from '../users/entities/user.entity';
import { OrderDetails, OrderItems, DeliveryDetails } from '../order/entities/order.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { OrderService } from '../order/order.service';
import { InvoiceService } from '../order/invoice.service';
import { Category } from '../category/entities/category.entity';
import { UploadService } from '../upload/upload.service';
import { Cart, CartItem } from '../cart/entities/cart.entity';
import { CartService } from '../cart/cart.service';
import { WardModule } from '../ward/ward.module';
import { AreaModule } from '../area/area.module';
import { Staff } from '../users/entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';

@Module({
  imports: [
    WardModule,
    AreaModule,
    TypeOrmModule.forFeature([
      ShareCatalog,
      ShareCatalogProducts,
      ShareCatalogProductStock,
      Products,
      ProductVariant,
      User,
      UserAddress,
      OrderDetails,
      OrderItems,
      DeliveryDetails,
      Category,
      Cart,
      CartItem,
      Staff,
      Outlets,
    ]),
  ],
  controllers: [ShareCatlaogController],
  providers: [
    ShareCatlaogService,
    ShareCatalogCronService,
    JwtService,
    WhatsappService,
    OrderService,
    UploadService,
    CartService,
    InvoiceService,
  ],
})
export class ShareCatlaogModule {}
