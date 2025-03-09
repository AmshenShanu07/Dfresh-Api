import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { ReceiveMessageDto } from './dto/receive-message.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  receiveMessage(@Body() body: ReceiveMessageDto) {
    return this.whatsappService.receiveMessage(body);
  }

  @Get()
  verify(@Query() query: any) {
    return { query };
  }
}
