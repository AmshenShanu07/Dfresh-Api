import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from 'src/common/dto/localized-text.dto';

export class CreateCuttingStyleDto {
  @ApiProperty({
    description: 'Name of the cutting style in English and Malayalam',
    type: LocalizedTextDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name: LocalizedTextDto;

  @ApiProperty({
    example: 'Bone-in pieces suitable for curries',
    description: 'Optional description of the cutting style',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the cutting style is active',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
