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
  sortOrder: string;

  @IsOptional()
  @IsString()
  search?: string;
}
