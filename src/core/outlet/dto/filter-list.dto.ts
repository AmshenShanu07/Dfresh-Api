import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

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
}
