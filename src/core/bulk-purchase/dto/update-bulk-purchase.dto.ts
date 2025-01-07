import { PartialType } from '@nestjs/swagger';
import { CreateBulkPurchaseDto } from './create-bulk-purchase.dto';

export class UpdateBulkPurchaseDto extends PartialType(CreateBulkPurchaseDto) {}
