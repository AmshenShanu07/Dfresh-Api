import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateCatlogDto {
  @ApiProperty({ example: 'Best Sellers' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Best Sellers Des' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: [] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  productIds: string[];
}
