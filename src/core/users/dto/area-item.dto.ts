import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// One row of the "Areas" list-builder on the outlet-agent (Staff) form.
// `id` is present when editing an existing area (keeps/renames it); absent
// for a brand-new area the admin just typed in.
export class AreaItemDto {
  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: 'MG Road' })
  @IsNotEmpty()
  @IsString()
  name: string;
}
