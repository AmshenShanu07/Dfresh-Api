import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { OrderService } from '../order/order.service';
import { ProductService } from '../product/product.service';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Products } from '../product/entities/product.entity';
import { OrderDetails, OrderItems, DeliveryDetails } from '../order/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Products, OrderDetails, OrderItems, DeliveryDetails])],
  controllers: [WhatsappController],
  providers: [WhatsappService, OrderService, ProductService, MetaCatalogService],
})
export class WhatsappModule {}
