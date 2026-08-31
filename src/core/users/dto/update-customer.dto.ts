import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UserLanguage } from 'src/common/enums';

/**
 * The customer's saved delivery address — the row the WhatsApp bot re-offers
 * at checkout. Omit the whole object to leave the address untouched.
 */
export class UpdateCustomerAddressDto {
  @ApiProperty({ example: '12A, Palm Grove' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 'Near the temple' })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiPropertyOptional({ example: '682001' })
  @IsOptional()
  @IsString()
  pinCode?: string;

  /** Who receives the delivery, if not the account holder. */
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  /** Delivery contact number. Falls back to the customer's own phone. */
  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsUUID()
  wardId: string;

  /** Null or absent when the chosen ward has no areas configured. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  areaId?: string | null;
}

/**
 * Deliberately NOT `PartialType(CreateUserDto)`.
 *
 * `CreateUserDto` carries `password` and `userType`, and the generic
 * `users/update/:id` route passes the DTO straight into `repository.update()`
 * — which would store the password in plaintext and let an admin's role be
 * set from the customer screen. Listing the editable fields explicitly is what
 * keeps those two off the wire.
 */
export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  /** Any format; normalised to the WhatsApp wa_id form server-side. */
  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  /** The language the bot replies in. Null means "never asked". */
  @ApiPropertyOptional({ enum: UserLanguage })
  @IsOptional()
  @IsEnum(UserLanguage)
  language?: UserLanguage | null;

  @ApiPropertyOptional({ type: UpdateCustomerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCustomerAddressDto)
  address?: UpdateCustomerAddressDto;
}
