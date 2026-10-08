import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from 'src/common/enums';

export class ManualOrderItemDto {
  @IsUUID()
  variantId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  /** Unit price. Prefilled from the catalog client-side, but staff-editable. */
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  cleaning?: boolean;

  /** CuttingStyle master id, or null/absent for no cutting. */
  @IsOptional()
  @IsUUID()
  cuttingStyleId?: string | null;
}

export class CreateManualOrderDto {
  /** Any format; normalised to the WhatsApp wa_id form server-side. */
  @IsString()
  @IsNotEmpty()
  phone: string;

  /** Required only when the phone matches no existing customer. */
  @IsOptional()
  @IsString()
  customerName?: string;

  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  @ArrayMinSize(1)
  items: ManualOrderItemDto[];

  @IsUUID()
  wardId: string;

  /**
   * The outlet to fulfil from. Required when the ward has two or more selling
   * outlets; ignored-but-validated otherwise (a single outlet is implied).
   */
  @IsOptional()
  @IsUUID()
  outletId?: string | null;

  /** Required by the service; optional here so it can name the missing field. */
  @IsOptional()
  @IsUUID()
  areaId?: string | null;

  @IsString()
  @IsNotEmpty()
  deliveryName: string;

  @IsString()
  @IsNotEmpty()
  deliveryPhone: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  pinCode: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}
