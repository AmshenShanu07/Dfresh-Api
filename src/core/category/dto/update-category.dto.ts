import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiProperty({
    example: true,
    description: 'The status of the category',
  })
  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;
}
