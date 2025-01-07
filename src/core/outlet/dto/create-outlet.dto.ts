import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOutletDto {
  @ApiProperty({
    example: 'Outlet Name',
    description: 'The name of the outlet',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Outlet Address',
    description: 'The address of the outlet',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: 'Outlet Phone Number',
    description: 'The phone number of the outlet',
    required: false,
  })
  @IsNotEmpty()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'Outlet Location',
    description: 'The location of the outlet',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty({
    example: 'Outlet User Id',
    description: 'The user id of the outlet',
    required: true,
  })
  @IsMongoId()
  @IsNotEmpty()
  userId: string;
}
