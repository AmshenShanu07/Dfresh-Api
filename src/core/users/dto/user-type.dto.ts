import { ApiProperty } from '@nestjs/swagger';
import { UserTypes } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UserTypeDto {
  @ApiProperty({ example: UserTypes.OUTLET_AGENT, required: true })
  @IsNotEmpty()
  @IsEnum(UserTypes)
  userType: UserTypes;
}
