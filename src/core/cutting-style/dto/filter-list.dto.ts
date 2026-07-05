import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

enum CuttingStyleSortBy {
  name = 'name',
  createdAt = 'createdAt',
}

export class CuttingStyleFilterDto extends PickType(FilterCommonDto, [
  'pageNumber',
  'count',
  'sortOrder',
]) {
  @ApiProperty({
    example: 'createdAt',
    description: "Sort by 'name' or 'createdAt'",
  })
  @IsNotEmpty()
  @IsEnum(CuttingStyleSortBy)
  sortBy: CuttingStyleSortBy;
}
