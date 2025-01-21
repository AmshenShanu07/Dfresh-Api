import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/services/prisma.service';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, JwtService, PrismaService],
})
export class CategoryModule {}
