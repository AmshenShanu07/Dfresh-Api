import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User, UserAddress } from './entities/user.entity';
import { Staff } from './entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { AreaModule } from '../area/area.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, Staff, Outlets]),
    AreaModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, JwtService],
  exports: [TypeOrmModule],
})
export class UsersModule {}
