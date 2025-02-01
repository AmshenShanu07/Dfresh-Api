import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  quantityUnit: ProductUnits;

  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  outletId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsNotEmpty()
  totalPrice: number;

  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  pricePerUnit: number;

  @ApiProperty({ example: '' })
  @IsString()
  @IsNotEmpty()
  batchNumber: string;
}
