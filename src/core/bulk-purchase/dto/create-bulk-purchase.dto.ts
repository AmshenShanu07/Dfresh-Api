import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBulkPurchaseDto {
  @ApiProperty({ example: 'Tuna' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  purchaseQuantity: number;

  @ApiProperty({ example: 'kg' })
  @IsEnum(ProductUnits)
  @IsNotEmpty()
  purchaseUnit: ProductUnits;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  purchasePrice: number;

  @ApiProperty({ example: '2021-09-01' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: Date;
}
