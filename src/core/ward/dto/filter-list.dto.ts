import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

enum WardSortBy {
  wardNumber = 'wardNumber',
  localBodyName = 'localBodyName',
  createdAt = 'createdAt',
}

export class WardFilterDto extends PickType(FilterCommonDto, [
  'pageNumber',
  'count',
  'sortOrder',
]) {
  @ApiProperty({
    example: 'createdAt',
    description: "Sort by 'wardNumber', 'localBodyName' or 'createdAt'",
  })
  @IsNotEmpty()
  @IsEnum(WardSortBy)
  sortBy: WardSortBy;
}
