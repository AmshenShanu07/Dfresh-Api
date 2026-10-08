import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateOutletDto } from './create-outlet.dto';
import { IsBoolean, IsOptional } from 'class-validator';

// Agents are managed through the staff endpoints once the outlet exists.
export class UpdateOutletDto extends PartialType(
  OmitType(CreateOutletDto, ['agents'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
