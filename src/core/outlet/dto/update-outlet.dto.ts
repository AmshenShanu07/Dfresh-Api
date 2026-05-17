import { PartialType } from '@nestjs/swagger';
import { CreateOutletDto } from './create-outlet.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateOutletDto extends PartialType(CreateOutletDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
