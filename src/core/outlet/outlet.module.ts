import { Module } from '@nestjs/common';
import { OutletService } from './outlet.service';
import { OutletController } from './outlet.controller';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Outlets } from './entities/outlet.entity';
import { Staff } from '../users/entities/staff.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Outlets, Staff, User])],
  controllers: [OutletController],
  providers: [OutletService, JwtService],
})
export class OutletModule {}
