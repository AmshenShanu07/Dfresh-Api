import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/services/prisma.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, JwtService, PrismaService, JwtService],
})
export class ProductModule {}
