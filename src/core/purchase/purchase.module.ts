import { Module } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [PurchaseController],
  providers: [PurchaseService, PrismaService, JwtService],
})
export class PurchaseModule {}
