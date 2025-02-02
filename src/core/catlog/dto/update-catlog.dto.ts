import { PartialType } from '@nestjs/swagger';
import { CreateCatlogDto } from './create-catlog.dto';

export class UpdateCatlogDto extends PartialType(CreateCatlogDto) {}
