import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/services/prisma.service';
import { MetaCatalogService } from 'src/services/meta-catalog.service';

@Module({
  controllers: [ProductController],
  providers: [
    ProductService, 
    JwtService, 
    PrismaService, 
    JwtService,
    MetaCatalogService
  ],
})
export class ProductModule {}
