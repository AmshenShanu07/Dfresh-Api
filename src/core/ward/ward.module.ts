import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Ward } from './entities/ward.entity';
import { WardService } from './ward.service';
import { WardController } from './ward.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ward, User])],
  controllers: [WardController],
  providers: [WardService, JwtService],
  exports: [WardService],
})
export class WardModule {}
