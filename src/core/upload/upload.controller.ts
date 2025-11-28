import { Controller, Post, UploadedFile } from '@nestjs/common';
import { UploadService } from './upload.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { ApiBody } from '@nestjs/swagger';
import { ApiFileUpload } from './decorator/upload-file.decorator';
import { Express } from 'express';
import { ParseFile } from './pipe/parse-file.pipe';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @ApiBody({ type: CreateUploadDto })
  @ApiFileUpload(CreateUploadDto)
  @Post()
  create(@UploadedFile(ParseFile) file: Express.Multer.File) {
    return this.uploadService.uploadFile(file);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.uploadService.remove(+id);
  // }
}
