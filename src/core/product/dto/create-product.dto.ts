import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateProductVariantDto } from './create-product-variant.dto';

export class CreateProductDto {
  @ApiProperty({ description: 'Name of the product', example: 'Tuna Fish' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Description of the product', example: 'Fresh tuna' })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Product images', example: ['https://example.com/img.jpg'] })
  @IsNotEmpty()
  @IsString({ each: true })
  @IsArray()
  image: string[];

  @ApiProperty({ description: 'Category ID', example: 'kj1b43kjb123' })
  @IsNotEmpty()
  @IsString()
  categoryId: string;

  @ApiProperty({ description: 'Cleaning available for this product', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cleaning?: boolean;

  @ApiProperty({ description: 'Cutting available for this product', example: false, required: false })
  @IsOptional()
  @IsBoolean()
  cutting?: boolean;

  @ApiProperty({ description: 'Variants to create along with the product', type: [CreateProductVariantDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
