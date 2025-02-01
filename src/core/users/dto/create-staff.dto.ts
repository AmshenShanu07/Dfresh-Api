import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

class BaseStaffDto extends PartialType(CreateUserDto) {
  @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsString()
  outletId: string;
}

export class CreateStaffDto extends PartialType(BaseStaffDto) {}
