import { Module } from '@nestjs/common';
import { CatlogService } from './catlog.service';
import { CatlogController } from './catlog.controller';
import { PrismaService } from 'src/services/prisma.service';

@Module({
  controllers: [CatlogController],
  providers: [CatlogService, PrismaService],
})
export class CatlogModule {}
