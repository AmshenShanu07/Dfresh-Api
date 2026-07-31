import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './export/report-pdf.service';
import { User } from '../users/entities/user.entity';

/**
 * `User` in forFeature and `JwtService` in providers are both required by
 * UserAuthGuard — omitting either fails at runtime with
 * `"UserRepository" at index [1] is available in the ReportsModule context`.
 *
 * No other entity is registered here: the report queries go through the
 * injected DataSource (ctx.db.getRepository(...)) rather than per-entity
 * repository injection, so adding a report that touches a new table needs no
 * change to this module. Entities are still discovered by autoLoadEntities.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPdfService, JwtService],
})
export class ReportsModule {}
