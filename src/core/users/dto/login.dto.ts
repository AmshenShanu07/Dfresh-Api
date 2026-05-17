import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '1234567890', description: 'Phone number' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'password', description: 'Password' })
  @IsString()
  password: string;
}
