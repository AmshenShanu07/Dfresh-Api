import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Supplier Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'SN' })
  @IsString()
  @IsNotEmpty()
  supplierCode: string;

  @ApiProperty({ example: '7012670512' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '7012670512' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: '7012670512' })
  @IsString()
  @IsOptional()
  address?: string;
}
