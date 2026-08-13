import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocalizedTextDto } from 'src/common/dto/localized-text.dto';

// One row of the "Areas" list-builder on the outlet-agent (Staff) form.
// `id` is present when editing an existing area (keeps/renames it); absent
// for a brand-new area the admin just typed in.
export class AreaItemDto {
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name: LocalizedTextDto;
}
