import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Products } from './entities/product.entity';
import { ProductVariant, VariantCuttingStyle } from './entities/product-variant.entity';
import { ProductCuttingStyle } from './entities/product-cutting-style.entity';
import { CuttingStyle } from '../cutting-style/entities/cutting-style.entity';
import { User } from '../users/entities/user.entity';
import { Category } from '../category/entities/category.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Products,
      ProductVariant,
      VariantCuttingStyle,
      ProductCuttingStyle,
      CuttingStyle,
      User,
      Category,
    ]),
  ],
  controllers: [ProductController],
  providers: [ProductService, JwtService],
  exports: [ProductService],
})
export class ProductModule {}
