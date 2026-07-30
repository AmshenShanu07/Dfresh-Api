import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from './create-user.dto';
import { AreaItemDto } from './area-item.dto';

class BaseStaffDto extends PartialType(CreateUserDto) {
  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  outletId: string;

  // Only meaningful when userType is OUTLET_AGENT — the list of areas (within
  // the chosen outlet's ward) this agent covers.
  @ApiPropertyOptional({ type: [AreaItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AreaItemDto)
  areas?: AreaItemDto[];
}

export class CreateStaffDto extends PartialType(BaseStaffDto) {}
