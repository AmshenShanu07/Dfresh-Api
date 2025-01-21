import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    description: 'Name of the product',
    example: 'Product 1',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Image of the product',
    example: ['https://example'],
  })
  @IsNotEmpty()
  @IsString({ each: true })
  @IsArray()
  image: string[];

  @ApiProperty({
    description: 'Price of the product',
    example: 'kj1b43kjb123',
  })
  @IsNotEmpty()
  @IsString()
  categoryId: string;
}
