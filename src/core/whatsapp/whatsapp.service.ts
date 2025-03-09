import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ReceiveMessageDto } from './dto/receive-message.dto';

// const a = {
//   object: 'whatsapp_business_account',
//   entry: [
//     {
//       id: '115730194473734',
//       changes: [
//         {
//           value: {
//             messaging_product: 'whatsapp',
//             metadata: {
//               display_phone_number: '16469076883',
//               phone_number_id: '111491931567355',
//             },
//             contacts: [
//               { profile: { name: 'Rishabh Rawat' }, wa_id: '918587808715' },
//             ],
//             messages: [
//               {
//                 from: '918587805615',
//                 id: 'wamid.HBgMOTE4NTg3ODA1NjE1FQIAEhggQjEwMjM1QzQyQUM4MEQ1MURCQjhBQjBFREFFMkQwM0MA',
//                 timestamp: '1653161271',
//                 text: { body: 'Thank you so much' },
//                 type: 'text',
//               },
//             ],
//           },
//           field: 'messages',
//         },
//       ],
//     },
//   ],
// };

@Injectable()
export class WhatsappService {
  private readonly botToken: string;
  private readonly tgChatId: string;
  private readonly waPhoneNumberId: string;
  private readonly waUserToken: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('BOT_TOKEN');
    this.tgChatId = this.configService.get<string>('TG_CHAT_ID');
    this.waPhoneNumberId = this.configService.get<string>('WA_PHONE_NUMBER_ID');
    this.waUserToken = this.configService.get<string>('WA_USER_TOKEN');
  }

  async receiveMessage(data: ReceiveMessageDto) {
    await this.sendLog(JSON.stringify(data));

    const message = data.entry[0].changes[0].value.messages[0].text.body;
    const name = data.entry[0].changes[0].value.contacts[0].profile.name;
    const phone = data.entry[0].changes[0].value.messages[0].from;

    if (message === '/start') await this.sendWelcomeMessage(name, phone);

    return message;
  }

  verify() {
    return `This action returns all whatsapp`;
  }

  async sendWelcomeMessage(name: string, phone: string) {
    const url = `https://graph.facebook.com/v22.0/${this.waPhoneNumberId}/messages`;
    const message = `Hello ${name}, welcome to our store! How can I help you today?`;
    console.log(this.waUserToken, this.waPhoneNumberId, phone, name);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: {
        body: message,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.waUserToken}`,
        },
      });

      console.log('Message sent:', response.data);
    } catch (error) {
      console.error(
        'Error sending message:',
        error.response?.data || error.message,
      );
    }
  }

  async sendLog(log: string) {
    console.log(this.botToken, this.tgChatId);
    console.log(log);
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: this.tgChatId,
          text: log,
        },
      );

      console.log('TG Logged!');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}
