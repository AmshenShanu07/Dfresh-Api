import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateStaffDto extends PartialType(CreateUserDto) {
  // Empty string means "this role has no outlet" — the service drops any
  // existing Staff join row in that case.
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  outletId?: string;
}
