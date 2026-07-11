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
  IsPositive,
  IsString,
  Matches,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/** Fails when the decorated property equals the named sibling property. */
function IsNotEqualTo(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotEqualTo',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [related] = args.constraints;
          return value !== (args.object as any)[related];
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must not equal ${args.constraints[0]}`;
        },
      },
    });
  };
}

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

  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive({ message: 'price must be greater than 0' })
  price: number;
}

class ProductQuantityDto {
  @ApiProperty({ example: 'abcdeif' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ example: 10, description: 'Offered quantity for this product in the window.' })
  @IsNotEmpty()
  @IsNumber()
  qnty: number;

  @ApiProperty({ example: ProductUnits.KG })
  @IsNotEmpty()
  @IsEnum(ProductUnits)
  qntyUnit: ProductUnits;
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

  @ApiProperty({ type: [ProductQuantityDto], description: 'Per-product offered stock for the window.' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductQuantityDto)
  productQuantities: ProductQuantityDto[];

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
  @IsNotEqualTo('startTime', {
    message: 'endTime must not equal startTime (window would be always-open)',
  })
  endTime: string;
}
