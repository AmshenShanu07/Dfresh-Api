import { Module } from '@nestjs/common';
import { OutletService } from './outlet.service';
import { OutletController } from './outlet.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [OutletController],
  providers: [OutletService, PrismaService, JwtService],
})
export class OutletModule {}
