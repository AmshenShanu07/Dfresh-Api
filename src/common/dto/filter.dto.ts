import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class FilterCommonDto {
  @ApiProperty({
    example: 1,
    description: 'Page number',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  pageNumber: number;

  @ApiProperty({
    example: 10,
    description: 'Item Count',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  count: number;

  @ApiProperty({
    example: 1,
    description: '1 or -1',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  sortOrder: number;

  // @IsOptional()
  // @IsString()
  // search?: string;
}
