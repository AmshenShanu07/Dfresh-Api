import { Module } from '@nestjs/common';
import { OutletService } from './outlet.service';
import { OutletController } from './outlet.controller';
import { PrismaService } from 'src/services/prisma.service';

@Module({
  controllers: [OutletController],
  providers: [OutletService, PrismaService],
})
export class OutletModule {}
