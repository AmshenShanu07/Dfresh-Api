import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';

export class CleaningDetailsDto {
  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  releasedQnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  releasedQntyUnit: ProductUnits;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  cleanedQnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  cleanedQntyUnit: ProductUnits;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  cleanedCount: number;
}
