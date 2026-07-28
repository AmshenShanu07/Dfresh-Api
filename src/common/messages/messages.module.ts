import { Global, Module } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * Global so MessagesService can be injected anywhere without adding it to each
 * module's providers — WhatsappService is instantiated by both WhatsappModule
 * and ShareCatlaogModule, and missing a provider in one of them is this repo's
 * most common runtime error.
 */
@Global()
@Module({
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
