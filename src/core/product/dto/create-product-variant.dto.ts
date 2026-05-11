import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cutting?: boolean;
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

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cutting?: boolean;
}
