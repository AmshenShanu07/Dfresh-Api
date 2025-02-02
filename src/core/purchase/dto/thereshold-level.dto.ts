import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';

export class ThresholdLevelDto {
  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  thresholdQnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  thresholdQntyUnit: ProductUnits;
}
