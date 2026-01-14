import { Module } from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatlaogController } from './share-catlaog.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MetaCatalogService } from 'src/services/meta-catalog.service';

@Module({
  controllers: [ShareCatlaogController],
  providers: [ShareCatlaogService, PrismaService, JwtService, MetaCatalogService],
})
export class ShareCatlaogModule {}
