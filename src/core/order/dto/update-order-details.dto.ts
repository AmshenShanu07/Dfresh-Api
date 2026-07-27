import { OrderStatus } from 'src/common/enums';

export class UpdateOrderItemWeightDto {
  id: string;
  cleanedWeight: number | null;
  cleanedWeightUnit: string | null;
}

export class UpdateOrderDetailsDto {
  status?: OrderStatus;
  // The delivery agent assigned to the order. Required when transitioning to
  // DISPATCHED; must be an agent of the order's derived outlet.
  deliveryAgentId?: string;
  items?: UpdateOrderItemWeightDto[];
}
