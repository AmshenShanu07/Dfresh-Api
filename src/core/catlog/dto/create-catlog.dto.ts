import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class CreateCatlogProductDto {
  @ApiProperty({ example: 'abcdefg' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 'abcdefg' })
  @IsString()
  @IsNotEmpty()
  productCatalogId: string;
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
  @Type(() => CreateCatlogProductDto)
  @IsNotEmpty()
  products: CreateCatlogProductDto[];
}
