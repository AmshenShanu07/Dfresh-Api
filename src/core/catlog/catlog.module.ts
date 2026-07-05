import { Module } from '@nestjs/common';
import { CatlogService } from './catlog.service';
import { CatlogController } from './catlog.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Catalog } from './entities/catalog.entity';
import { CatalogProducts } from './entities/catalog-products.entity';
import { CatalogProductVariants } from './entities/catalog-product-variants.entity';
import { User } from '../users/entities/user.entity';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Catalog,
      CatalogProducts,
      CatalogProductVariants,
      User,
      ShareCatalog,
    ]),
  ],
  controllers: [CatlogController],
  providers: [CatlogService, JwtService],
})
export class CatlogModule {}
