import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from 'src/common/dto/localized-text.dto';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'The name of the category in English and Malayalam',
    type: LocalizedTextDto,
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name: LocalizedTextDto;
}
