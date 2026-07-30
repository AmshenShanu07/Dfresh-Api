import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { RANGE_KEYS, RangeKey } from 'src/common/utils/date-range';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: RANGE_KEYS,
    default: 'today',
    description: 'Reporting period, evaluated against IST calendar days.',
  })
  @IsOptional()
  @IsIn(RANGE_KEYS)
  range?: RangeKey = 'today';
}
