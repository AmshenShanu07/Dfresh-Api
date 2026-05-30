import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderDetails, OrderItems, DeliveryDetails } from './entities/order.entity';
import { User } from '../users/entities/user.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { JwtService } from '@nestjs/jwt';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderDetails, OrderItems, DeliveryDetails, User, ProductVariant]),
    WhatsappModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, JwtService],
  exports: [OrderService],
})
export class OrderModule {}
