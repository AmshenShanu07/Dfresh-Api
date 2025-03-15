import { PartialType } from '@nestjs/swagger';
import { CreateShareCatlaogDto } from './create-share-catlaog.dto';

export class UpdateShareCatlaogDto extends PartialType(CreateShareCatlaogDto) {}
