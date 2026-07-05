import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { CuttingStyle } from './entities/cutting-style.entity';
import { CuttingStyleService } from './cutting-style.service';
import { CuttingStyleController } from './cutting-style.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CuttingStyle, User])],
  controllers: [CuttingStyleController],
  providers: [CuttingStyleService, JwtService],
  exports: [CuttingStyleService],
})
export class CuttingStyleModule {}
