import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Area } from './entities/area.entity';
import { AreaService } from './area.service';
import { AreaController } from './area.controller';
import { Outlets } from '../outlet/entities/outlet.entity';
import { User } from '../users/entities/user.entity';

@Module({
  // User is required by UserAuthGuard on AreaController — without it Nest
  // fails at runtime with "UserRepository at index [1] is available in the
  // AreaModule context".
  imports: [TypeOrmModule.forFeature([Area, Outlets, User])],
  controllers: [AreaController],
  providers: [AreaService, JwtService],
  exports: [AreaService],
})
export class AreaModule {}
