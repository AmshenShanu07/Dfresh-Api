import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '1234567890', description: 'Phone number' })
  phone: string;

  @ApiProperty({ example: 'password', description: 'Password' })
  password: string;
}
