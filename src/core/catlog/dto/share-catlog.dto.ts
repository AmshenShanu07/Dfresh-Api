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

class CatlogProducts {
  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  qnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  qntyUnit: ProductUnits;

  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  price: number;
}

export class ShareCatlogDto {
  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  catlogId: string;

  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsDateString()
  publishDate: Date;

  @ApiProperty({ type: [CatlogProducts] })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CatlogProducts)
  products: CatlogProducts[];
}
