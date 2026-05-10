import { Module } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Purchase } from './entities/purchase.entity';
import { Products } from '../product/entities/product.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase, Products, Outlets, User])],
  controllers: [PurchaseController],
  providers: [PurchaseService, JwtService],
})
export class PurchaseModule {}
