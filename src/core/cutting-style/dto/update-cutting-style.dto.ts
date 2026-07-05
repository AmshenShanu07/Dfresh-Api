import { PartialType } from '@nestjs/swagger';
import { CreateCuttingStyleDto } from './create-cutting-style.dto';

export class UpdateCuttingStyleDto extends PartialType(CreateCuttingStyleDto) {}
