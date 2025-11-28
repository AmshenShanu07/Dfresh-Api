import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseFile implements PipeTransform {
  transform(
    files: Express.Multer.File | Express.Multer.File[],
  ): Express.Multer.File | Express.Multer.File[] {
    if (files === undefined || files === null) {
      throw new BadRequestException(['Upload Failed']);
    }
    if (Array.isArray(files) && files.length === 0) {
      throw new BadRequestException(['Upload Failed']);
    }
    return files;
  }
}
