import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { PrismaService } from 'src/services/prisma.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappService, PrismaService],
})
export class WhatsappModule {}
