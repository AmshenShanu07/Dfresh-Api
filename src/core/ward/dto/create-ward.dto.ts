import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ConstituencyType } from 'src/common/enums';
import { LocalizedTextDto } from 'src/common/dto/localized-text.dto';

export class CreateWardDto {
  @ApiProperty({ example: 7, description: 'District id (1-14)', required: true })
  @IsNotEmpty()
  @IsNumber()
  districtId: number;

  @ApiProperty({
    description: 'District name in English and Malayalam',
    type: LocalizedTextDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  districtName: LocalizedTextDto;

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
    description: 'Local body name in English and Malayalam',
    type: LocalizedTextDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  localBodyName: LocalizedTextDto;

  @ApiProperty({
    example: '12',
    description: 'Ward number within the local body',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  wardNumber: string;

  @ApiProperty({
    description: 'Ward name in English and Malayalam',
    type: LocalizedTextDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  wardName: LocalizedTextDto;

  @ApiProperty({
    example: true,
    description: 'Whether the ward is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
