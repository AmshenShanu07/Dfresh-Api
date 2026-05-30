import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { OrderService } from '../order/order.service';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { UploadService } from '../upload/upload.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UserAddress } from '../users/entities/user.entity';
import { Products } from '../product/entities/product.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { OrderDetails, OrderItems, DeliveryDetails } from '../order/entities/order.entity';
import { Category } from '../category/entities/category.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import { ShareCatalogProducts } from '../share-catlaog/entities/share-catalog-products.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserAddress, Products, ProductVariant, OrderDetails, OrderItems, DeliveryDetails, Category, ShareCatalog, ShareCatalogProducts])],
  controllers: [WhatsappController],
  providers: [WhatsappService, OrderService, MetaCatalogService, UploadService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
