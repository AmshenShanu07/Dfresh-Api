import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post()
  receiveMessage(@Body() body: any) {
    return this.whatsappService.receiveMessage(body);
  }

  @Get()
  verify(
    @Query('hub.mode') mode: string, 
    @Query('hub.verify_token') token: string, 
    @Query('hub.challenge') challenge: string
  ): string {
    console.log('mode', mode);
    console.log('token', token);
    console.log('challenge', challenge);
    return challenge;
  }
}
