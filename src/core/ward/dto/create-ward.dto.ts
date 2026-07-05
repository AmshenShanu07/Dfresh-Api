import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ConstituencyType } from 'src/common/enums';

export class CreateWardDto {
  @ApiProperty({ example: 7, description: 'District id (1-14)', required: true })
  @IsNotEmpty()
  @IsNumber()
  districtId: number;

  @ApiProperty({
    example: 'ERNAKULAM',
    description: 'District name',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  districtName: string;

  @ApiProperty({
    example: ConstituencyType.MUNICIPAL_CORPORATION,
    enum: ConstituencyType,
    description: 'Type of constituency / local body',
    required: true,
  })
  @IsNotEmpty()
  @IsEnum(ConstituencyType)
  constituencyType: ConstituencyType;

  @ApiProperty({
    example: 'C07003',
    description: 'Local body id (from the Kerala local-body reference data)',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  localBodyId: string;

  @ApiProperty({
    example: 'Kochi',
    description: 'Local body name',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  localBodyName: string;

  @ApiProperty({
    example: '12',
    description: 'Ward number within the local body',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  wardNumber: string;

  @ApiProperty({
    example: true,
    description: 'Whether the ward is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
