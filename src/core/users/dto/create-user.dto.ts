import { ApiProperty } from '@nestjs/swagger';
import { UserTypes } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'John Doe', description: 'The name of the User' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    example: '1234567890',
    description: 'The phone number of the User',
  })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'password', description: 'The password of the User' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ example: '', description: 'The email of the User' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    example: UserTypes.CUSTOMER,
    description: 'The type of the User',
  })
  @IsNotEmpty()
  @IsEnum(UserTypes)
  userType: UserTypes;

  @ApiProperty({ example: '', description: 'The address of the User' })
  @IsString()
  @IsOptional()
  address?: string;
}
