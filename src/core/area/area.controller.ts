import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AreaService } from './area.service';
import { UserAuthGuard } from 'src/guards/user.guard';

/**
 * Areas are created and edited on the outlet-agent (Staff) form, never
 * standalone — so this controller is read-only. It exists for the
 * manual-order form, which needs the same ward → area choice the WhatsApp
 * checkout offers.
 */
@Controller('area')
export class AreaController {
  constructor(private readonly areaService: AreaService) {}

  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  @Get('by-ward/:wardId')
  async findByWard(@Param('wardId') wardId: string) {
    const areas = await this.areaService.findActiveByWard(wardId);
    return areas.map((area) => ({ id: area.id, name: area.name }));
  }
}
