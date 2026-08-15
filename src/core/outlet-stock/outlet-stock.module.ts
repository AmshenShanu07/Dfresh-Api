import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { OutletStockService } from './outlet-stock.service';
import { OutletStockController } from './outlet-stock.controller';
import { OutletProductStock } from './entities/outlet-product-stock.entity';
import { StockTransfer } from './entities/stock-transfer.entity';
import { Products } from '../product/entities/product.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutletProductStock,
      StockTransfer,
      Products,
      Outlets,
      User,
    ]),
  ],
  controllers: [OutletStockController],
  providers: [OutletStockService, JwtService],
  exports: [OutletStockService],
})
export class OutletStockModule {}
