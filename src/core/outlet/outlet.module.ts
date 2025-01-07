import { Module } from '@nestjs/common';
import { OutletService } from './outlet.service';
import { OutletController } from './outlet.controller';

@Module({
  controllers: [OutletController],
  providers: [OutletService],
})
export class OutletModule {}
