import { ApiProperty } from '@nestjs/swagger';
import { ProductUnits } from 'src/common/enums';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

class ShareCatalogProductsDto {
  @ApiProperty({ example: 'abcdeif' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ example: 'abcdefg' })
  @IsNotEmpty()
  @IsString()
  variantId: string;

  @ApiProperty({ example: '10' })
  @IsNotEmpty()
  @IsNumber()
  qnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  qntyUnit: ProductUnits;

  @ApiProperty({ example: 100 })
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiProperty({ example: 'abcdefg', required: false })
  @IsOptional()
  @IsString()
  productCatalogId?: string;
}

export class CreateShareCatlaogDto {
  @ApiProperty({ example: 'abcdefg' })
  @IsNotEmpty()
  @IsString()
  catalogId: string;

  @ApiProperty({ type: [ShareCatalogProductsDto] })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareCatalogProductsDto)
  shareCatalogProducts: ShareCatalogProductsDto[];

  @ApiProperty({
    example: ['mon', 'wed', 'fri'],
    description: 'Weekdays the schedule fires on. 3-letter lowercase codes.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEEKDAY_CODES as unknown as string[], { each: true })
  daysOfWeek: WeekdayCode[];

  @ApiProperty({ example: '06:00', description: 'Window start time in IST (HH:MM, 24h).' })
  @IsNotEmpty()
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'startTime must match HH:MM (24h)' })
  startTime: string;

  @ApiProperty({
    example: '10:00',
    description: 'Window end time in IST (HH:MM, 24h). If less than startTime the window crosses midnight.',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(TIME_HHMM_REGEX, { message: 'endTime must match HH:MM (24h)' })
  endTime: string;
}
