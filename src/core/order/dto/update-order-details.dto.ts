import { OrderStatus } from 'src/common/enums';

export class UpdateOrderItemWeightDto {
  id: string;
  cleanedWeight: number | null;
  cleanedWeightUnit: string | null;
}

export class UpdateOrderDetailsDto {
  status?: OrderStatus;
  items?: UpdateOrderItemWeightDto[];
}
