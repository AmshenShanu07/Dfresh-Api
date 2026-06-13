import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CUTTING_STYLES } from 'src/common/constants';

export class CuttingStyleDto {
  @ApiProperty({ example: 'Curry', enum: CUTTING_STYLES })
  @IsNotEmpty()
  @IsString()
  @IsIn(CUTTING_STYLES as unknown as string[])
  style: string;

  @ApiProperty({ example: 40 })
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

  @ApiProperty({ example: 'g', enum: ['g', 'kg'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['g', 'kg'])
  unit: 'g' | 'kg';

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cleaning?: boolean;

  @ApiProperty({ example: 10, required: false, description: 'Flat cleaning charge, applied when cleaning is enabled' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningCharge?: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cutting?: boolean;

  @ApiProperty({ type: [CuttingStyleDto], required: false, description: 'Cutting styles offered for this variant, with per-style price' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
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

  @ApiProperty({ example: 'g', enum: ['g', 'kg'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['g', 'kg'])
  unit?: 'g' | 'kg';

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cleaning?: boolean;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningCharge?: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cutting?: boolean;

  @ApiProperty({ type: [CuttingStyleDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CuttingStyleDto)
  cuttingStyles?: CuttingStyleDto[];
}
