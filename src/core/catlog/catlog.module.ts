import { Module } from '@nestjs/common';
import { CatlogService } from './catlog.service';
import { CatlogController } from './catlog.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [CatlogController],
  providers: [CatlogService, PrismaService, JwtService],
})
export class CatlogModule {}
