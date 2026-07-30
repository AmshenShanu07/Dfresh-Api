import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Area } from './entities/area.entity';
import { AreaService } from './area.service';
import { Outlets } from '../outlet/entities/outlet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Area, Outlets])],
  providers: [AreaService],
  exports: [AreaService],
})
export class AreaModule {}
