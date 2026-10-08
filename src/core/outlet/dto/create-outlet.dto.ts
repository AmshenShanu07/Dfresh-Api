import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AreaItemDto } from 'src/core/users/dto/area-item.dto';

// One outlet agent created together with the outlet. Same fields as the
// Staff form; the role is always OUTLET_AGENT and the outlet is the one
// being created.
export class CreateOutletAgentDto {
  @ApiProperty({ example: 'Agent Name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: '9999999999' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Agent address' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: 'password' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ type: [AreaItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Each agent needs at least one area' })
  @ValidateNested({ each: true })
  @Type(() => AreaItemDto)
  areas: AreaItemDto[];
}

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
    example: '9999999999',
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
    type: [CreateOutletAgentDto],
    description:
      'Outlet agents created with the outlet. An outlet starts active, and an active outlet needs at least one agent to receive orders.',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one outlet agent' })
  @ValidateNested({ each: true })
  @Type(() => CreateOutletAgentDto)
  agents: CreateOutletAgentDto[];

  @ApiProperty({
    example: true,
    description: 'The status of the outlet',
  })
  @IsNotEmpty()
  @IsBoolean()
  isSalesEnabled: boolean;

  @ApiProperty({
    example: '10',
    description: 'The status of the outlet',
  })
  @IsNotEmpty()
  @IsNumber()
  commission: number;

  @ApiProperty({
    example: 'ward-uuid',
    description: 'The ward this outlet serves',
  })
  @IsNotEmpty()
  @IsString()
  wardId: string;
}
