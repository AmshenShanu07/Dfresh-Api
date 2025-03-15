import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ShareCatlaogService } from './share-catlaog.service';
import { CreateShareCatlaogDto } from './dto/create-share-catlaog.dto';
import { UpdateShareCatlaogDto } from './dto/update-share-catlaog.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuthGuard } from 'src/guards/user.guard';
import { FilterCommonDto } from 'src/common/dto/filter.dto';

@Controller('share-catlaog')
export class ShareCatlaogController {
  constructor(private readonly shareCatlaogService: ShareCatlaogService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Post('create')
  create(@Body() createShareCatlaogDto: CreateShareCatlaogDto) {
    return this.shareCatlaogService.create(createShareCatlaogDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('all')
  findAll() {
    return this.shareCatlaogService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('/list')
  getList(@Query() filter: FilterCommonDto) {
    return this.shareCatlaogService.getList(filter);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.shareCatlaogService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Put('update/:id')
  update(
    @Param('id') id: string,
    @Body() updateShareCatlaogDto: UpdateShareCatlaogDto,
  ) {
    return this.shareCatlaogService.update(id, updateShareCatlaogDto);
  }

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.shareCatlaogService.remove(id);
  }
}
