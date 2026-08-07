import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { toOptionalBoolean } from 'src/common/dto/transforms';

enum OutletSortBy {
  name = 'name',
  createdAt = 'createdAt',
}

export class OutletFilterDto extends PickType(FilterCommonDto, [
  'pageNumber',
  'count',
  'sortOrder',
]) {
  @ApiProperty({
    example: 'createdAt',
    description: "Sort by 'name' or 'createdAt'",
  })
  @IsNotEmpty()
  @IsEnum(OutletSortBy)
  sortBy: OutletSortBy.createdAt;

  @ApiPropertyOptional({
    example: true,
    description: 'Omit for all outlets, true/false to filter by status.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Omit for all outlets, true/false to filter by sales enabled.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isSalesEnabled?: boolean;
}
