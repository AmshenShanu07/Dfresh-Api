import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from 'src/common/enums';

export class UpdateOrderItemWeightDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsOptional()
  @IsNumber()
  cleanedWeight: number | null;

  @IsOptional()
  @IsString()
  cleanedWeightUnit: string | null;
}

export class UpdateOrderDetailsDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // The delivery agent assigned to the order. Required when transitioning to
  // DISPATCHED; must be an agent of the order's derived outlet.
  @IsOptional()
  @IsString()
  deliveryAgentId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemWeightDto)
  items?: UpdateOrderItemWeightDto[];
}
