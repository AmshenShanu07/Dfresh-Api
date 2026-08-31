import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UserAddress } from './entities/user.entity';
import { Staff } from './entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { OrderDetails } from '../order/entities/order.entity';
import { AreaModule } from '../area/area.module';
import { WardModule } from '../ward/ward.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, Staff, Outlets, OrderDetails]),
    AreaModule,
    WardModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
