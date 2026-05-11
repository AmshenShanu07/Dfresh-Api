import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateWardDto {
  @ApiProperty({ example: '1', required: false })
  @IsOptional()
  @IsString()
  wardNumber?: string;

  @ApiProperty({ example: 'FORT KOCHI', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
