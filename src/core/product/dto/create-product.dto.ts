import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { ProductUnits } from 'src/common/enums';
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

  @ApiProperty({
    description: 'Cutting style master ids this product offers (product-level)',
    example: ['b3f1c2d4-...'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  cuttingStyleIds?: string[];

  @ApiProperty({ description: 'Initial stock quantity (in totalQuantityUnit)', example: 5, required: false })
  @IsOptional()
  @IsNumber()
  totalQuantity?: number;

  @ApiProperty({ description: 'Unit of the stock quantity', enum: ProductUnits, example: ProductUnits.KG, required: false })
  @IsOptional()
  @IsEnum(ProductUnits)
  totalQuantityUnit?: ProductUnits;

  @ApiProperty({ description: 'Variants to create along with the product', type: [CreateProductVariantDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
