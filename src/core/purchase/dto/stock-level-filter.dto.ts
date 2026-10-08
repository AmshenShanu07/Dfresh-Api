import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { STOCK_LEVEL_SORTS, StockLevelSort } from '../stock-level';

export class StockLevelFilterDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  pageNumber: number;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  count: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false, enum: STOCK_LEVEL_SORTS })
  @IsOptional()
  @IsIn(STOCK_LEVEL_SORTS)
  sort?: StockLevelSort;
}
