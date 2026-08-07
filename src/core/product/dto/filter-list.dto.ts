import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { FilterCommonDto } from 'src/common/dto/filter.dto';
import { toOptionalBoolean } from 'src/common/dto/transforms';

export class ProductFilterDto extends FilterCommonDto {
  @ApiPropertyOptional({
    example: 'tomato',
    description: 'Case-insensitive substring match on the product name.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Omit for all products, true/false to filter by status.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Restrict to a single category.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
