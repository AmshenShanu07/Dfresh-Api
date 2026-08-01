import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from 'src/common/enums';

export class UpdateOrderDetailsDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // The delivery agent assigned to the order. Required when transitioning to
  // DISPATCHED; must be an agent of the order's derived outlet.
  @IsOptional()
  @IsString()
  deliveryAgentId?: string;
}
