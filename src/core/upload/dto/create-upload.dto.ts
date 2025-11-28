import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUploadDto {
  @ApiProperty({
    example: '',
    type: 'string',
    format: 'binary',
  })
  @IsNotEmpty()
  @IsString()
  file: string;
}
