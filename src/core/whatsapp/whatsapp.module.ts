import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaService } from 'src/services/prisma.service';
import { OrderService } from '../order/order.service';
import { ProductService } from '../product/product.service';
import { MetaCatalogService } from 'src/services/meta-catalog.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    WhatsappService, 
    PrismaService, 
    OrderService, 
    ProductService, 
    MetaCatalogService
  ],
})
export class WhatsappModule {}
