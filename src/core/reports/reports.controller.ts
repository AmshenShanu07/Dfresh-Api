import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserAuthGuard } from 'src/guards/user.guard';
import { ReportsService } from './reports.service';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * The registry listing — powers the landing tiles and Swagger discovery.
   * Declared before ':slug' so the literal path wins the route match.
   */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get()
  list() {
    return this.reportsService.listReports();
  }

  /** One page of a report, plus columns and whole-set stats. */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get(':slug')
  getReport(@Param('slug') slug: string, @Query() query: ReportQueryDto) {
    return this.reportsService.getReport(slug, query);
  }

  /**
   * The full result set as a downloadable file.
   *
   * A separate route rather than `?format=` on the JSON one: it keeps @Res()
   * off the JSON path (whose Swagger schema would otherwise be a lie), and it
   * lets ReportExportQueryDto omit the paging params entirely so the global
   * whitelist pipe strips a stray `?count=10` instead of honouring it.
   */
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get(':slug/export')
  async exportReport(
    @Param('slug') slug: string,
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename, contentType } =
      await this.reportsService.exportReport(slug, query);

    res.set({
      'Content-Type': contentType,
      // The frontend fetches this as a blob (the route is Bearer-guarded, so a
      // plain <a href> can't reach it) and therefore never sees this header —
      // it names the file client-side. Kept so `curl -OJ` and Swagger's
      // download button still behave.
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }
}
