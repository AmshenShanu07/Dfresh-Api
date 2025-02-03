import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveCatlogProductDto {
  @ApiProperty({ example: '', required: true })
  @IsNotEmpty()
  @IsString()
  catlogId: string;

  @ApiProperty({ example: '', required: true })
  @IsNotEmpty()
  @IsString()
  productId: string;
}
