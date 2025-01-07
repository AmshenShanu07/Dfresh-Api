import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '09123456789', description: 'Phone number' })
  phone: string;

  @ApiProperty({ example: 'password', description: 'Password' })
  password: string;
}
