import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** A name/label entered in both languages the bot speaks. Both are mandatory. */
export class LocalizedTextDto {
  @ApiProperty({ example: 'Tomato', description: 'English text' })
  @IsNotEmpty()
  @IsString()
  en: string;

  @ApiProperty({ example: 'Tomato', description: 'Malayalam text' })
  @IsNotEmpty()
  @IsString()
  ml: string;
}
