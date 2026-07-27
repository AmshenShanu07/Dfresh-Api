import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Unit } from '../../../common/utils/units';

export class CuttingStyleDto {
  @ApiProperty({ example: 'b3f1c2d4-...', description: 'Cutting style master id' })
  @IsNotEmpty()
  @IsUUID()
  cuttingStyleId: string;

  @ApiProperty({ example: 40, description: 'Price for this style on this variant' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateProductVariantDto {
  @ApiProperty({ example: 500 })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  weight: number;

  @ApiProperty({ example: 'g', enum: ['g', 'kg', 'ml', 'l', 'count'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['g', 'kg', 'ml', 'l', 'count'])
  unit: Unit;

  @ApiProperty({
    example: 10,
    required: false,
    description:
      'Cleaning charge for this variant, applied when the product has cleaning enabled',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningCharge?: number;

  @ApiProperty({
    example: 150,
    required: false,
    description:
      'Weight (in grams) lost while cleaning this variant. Only applied for WEIGHT products.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastageWeight?: number;

  @ApiProperty({
    type: [CuttingStyleDto],
    required: false,
    description:
      "Per-style prices for this variant. Style ids must be within the product's selected cutting styles.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CuttingStyleDto)
  cuttingStyles?: CuttingStyleDto[];
}

export class UpdateProductVariantDto {
  @ApiProperty({ example: 500, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  weight?: number;

  @ApiProperty({ example: 'g', enum: ['g', 'kg', 'ml', 'l', 'count'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['g', 'kg', 'ml', 'l', 'count'])
  unit?: Unit;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningCharge?: number;

  @ApiProperty({ example: 150, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastageWeight?: number;

  @ApiProperty({ type: [CuttingStyleDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CuttingStyleDto)
  cuttingStyles?: CuttingStyleDto[];
}
