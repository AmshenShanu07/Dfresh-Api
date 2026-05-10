import { Module } from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatlaogController } from './share-catlaog.controller';
import { JwtService } from '@nestjs/jwt';
import { MetaCatalogService } from 'src/services/meta-catalog.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareCatalog } from './entities/share-catalog.entity';
import { ShareCatalogProducts } from './entities/share-catalog-products.entity';
import { Products } from '../product/entities/product.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ShareCatalog, ShareCatalogProducts, Products, User])],
  controllers: [ShareCatlaogController],
  providers: [ShareCatlaogService, JwtService, MetaCatalogService],
})
export class ShareCatlaogModule {}
