import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateCatlogVariantDto {
  @ApiProperty({ example: 'variant-uuid' })
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @ApiProperty({ example: 250 })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}

export class CreateCatlogProductDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ type: [CreateCatlogVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCatlogVariantDto)
  variants: CreateCatlogVariantDto[];
}

export class CreateCatlogDto {
  @ApiProperty({ example: 'Best Sellers' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Best Sellers Des' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ type: [CreateCatlogProductDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCatlogProductDto)
  @IsNotEmpty()
  products: CreateCatlogProductDto[];
}
