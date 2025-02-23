import { Module } from '@nestjs/common';
import { SupplierService } from './supplier.service';
import { SupplierController } from './supplier.controller';
import { PrismaService } from 'src/services/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [SupplierController],
  providers: [SupplierService, PrismaService, JwtService],
})
export class SupplierModule {}
