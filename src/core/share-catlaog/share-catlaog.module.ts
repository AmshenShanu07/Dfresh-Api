import { Module } from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { ShareCatlaogController } from './share-catlaog.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [ShareCatlaogController],
  providers: [ShareCatlaogService, PrismaService, JwtService],
})
export class ShareCatlaogModule {}
