import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { toOptionalBoolean } from 'src/common/dto/transforms';

export enum OutletOptionsSortBy {
  name = 'name',
  createdAt = 'createdAt',
}

export enum OutletOptionsSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Query for the flat, unpaginated outlet list used by dropdowns. Deleted
 * outlets are never returned; every field here is optional.
 */
export class OutletOptionsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Omit for all outlets, true/false to filter by status.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: OutletOptionsSortBy,
    default: OutletOptionsSortBy.createdAt,
  })
  @IsOptional()
  @IsEnum(OutletOptionsSortBy)
  sortBy?: OutletOptionsSortBy;

  @ApiPropertyOptional({
    enum: OutletOptionsSortOrder,
    default: OutletOptionsSortOrder.DESC,
    description: 'DESC (default) puts the most recently created first.',
  })
  @IsOptional()
  @IsEnum(OutletOptionsSortOrder)
  sortOrder?: OutletOptionsSortOrder;
}
