import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { JwtService } from '@nestjs/jwt';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Products } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { User } from '../users/entities/user.entity';
import { Category } from '../category/entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Products, ProductVariant, User, Category])],
  controllers: [ProductController],
  providers: [ProductService, JwtService, MetaCatalogService],
  exports: [ProductService],
})
export class ProductModule {}
