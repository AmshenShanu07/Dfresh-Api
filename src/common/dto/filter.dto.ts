import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class FilterCommonDto {
  @IsNotEmpty()
  @IsNumber()
  pageNumber: number;

  @IsNotEmpty()
  @IsNumber()
  count: number;

  @IsNotEmpty()
  @IsNumber()
  sortOrder: number;

  @IsOptional()
  @IsString()
  search?: string;
}
