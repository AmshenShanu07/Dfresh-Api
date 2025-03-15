import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class ShareCatalogProductsDto {
  @ApiProperty({ example: 'abcdeif' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ example: '10' })
  @IsNotEmpty()
  @IsNumber()
  qnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  qntyUnit: ProductUnits;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  price: number;
}

export class CreateShareCatlaogDto {
  @ApiProperty({ example: 'abcdefg' })
  @IsNotEmpty()
  @IsString()
  catalogId: string;

  @ApiProperty({ type: [ShareCatalogProductsDto] })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareCatalogProductsDto)
  shareCatalogProducts: ShareCatalogProductsDto[];

  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  publishDate: string;

  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  publishTime: string;
}
