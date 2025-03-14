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

// const data = {
//   object: 'whatsapp_business_account',
//   entry: [
//     {
//       id: '1139607347569214',
//       changes: [
//         {
//           value: {
//             messaging_product: 'whatsapp',
//             metadata: {
//               display_phone_number: '916235982661',
//               phone_number_id: '502595802947534',
//             },
//             contacts: [{ profile: { name: 'sh4nu' }, wa_id: '917012670512' }],
//             messages: [
//               {
//                 context: {
//                   from: '916235982661',
//                   id: 'wamid.HBgMOTE3MDEyNjcwNTEyFQIAERgSRkMzN0ZBQTRDREJCMTU4QUZDAA==',
//                 },
//                 from: '917012670512',
//                 id: 'wamid.HBgMOTE3MDEyNjcwNTEyFQIAEhgUM0E1MUYyRTg0RUEyQjNCNzQ1NDcA',
//                 timestamp: '1741524954',
//                 type: 'interactive',
//                 interactive: {
//                   type: 'button_reply',
//                   button_reply: { id: 'hello-button', title: 'Hello' },
//                 },
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

    const type: string = data.entry[0]?.changes[0]?.value.messages[0]?.type;

    if (!type) return 'This action only accepts text messages';

    if (type == 'interactive') {
      const btnId =
        data.entry[0].changes[0].value.messages[0].interactive.button_reply.id;

      if (btnId === 'get-catlog') {
        const phone = data.entry[0].changes[0].value.messages[0].from;
        return this.sendProduct(phone);
      }

      return 'This action only accepts text messages';
    }

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
    console.log(this.waUserToken, this.waPhoneNumberId, phone, name);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'image',
          image: {
            id: '1140150290765079',
          },
        },
        body: {
          text: `ഹായ് ${name}!\n നിങ്ങളുടെ ക്രിയേറ്റീവ് സ്റ്റുഡിയോയിലേക്ക് സ്വാഗതം, ദയവായി ഞങ്ങളുടെ ഉൽപ്പന്നങ്ങൾ പരിശോധിക്കുക.\n\n നന്ദി!`,
        },
        footer: {
          text: 'Amshen Yesudas: Your gateway to creativity!™',
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'get-catlog',
                title: 'See Products',
              },
            },
          ],
        },
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

  async sendProduct(phone: string) {
    const url = `https://graph.facebook.com/v22.0/${this.waPhoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'catalog_message',
        body: {
          text: 'ഹലോ! താൽപ്പര്യത്തിന് നന്ദി. ഓർഡർ ചെയ്യുന്നത് എളുപ്പമാണ്. ഞങ്ങളുടെ കാറ്റലോഗ് സന്ദർശിച്ച് വാങ്ങാൻ ഇനങ്ങൾ ചേർക്കുക.',
        },
        action: {
          name: 'catalog_message',
          parameters: {
            thumbnail_product_retailer_id: 'e6a9dwzudz',
          },
        },
        footer: {
          text: 'Best grocery deals on WhatsApp!',
        },
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
