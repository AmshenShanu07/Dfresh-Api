import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { toOptionalBoolean } from 'src/common/dto/transforms';

/**
 * Extends the shared pagination DTO rather than adding these fields to it —
 * WardFilterDto and CuttingStyleFilterDto also build on FilterCommonDto and
 * have no use for a name search or an isActive filter.
 */
export class CategoryFilterDto extends FilterCommonDto {
  @ApiPropertyOptional({
    example: 'veg',
    description: 'Case-insensitive substring match on the category name.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Omit for all categories, true/false to filter by status.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;
}
