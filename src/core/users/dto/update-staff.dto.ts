import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';
import { AreaItemDto } from './area-item.dto';

export class UpdateStaffDto extends PartialType(CreateUserDto) {
  // Empty string means "this role has no outlet" — the service drops any
  // existing Staff join row in that case.
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  outletId?: string;

  // Only meaningful when userType is OUTLET_AGENT — the full desired area
  // list. Reconciled against existing rows (kept/renamed/removed/added).
  @ApiPropertyOptional({ type: [AreaItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AreaItemDto)
  areas?: AreaItemDto[];
}
