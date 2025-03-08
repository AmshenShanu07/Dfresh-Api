import { Injectable } from '@nestjs/common';
import { UpdateWhatsappDto } from './dto/update-whatsapp.dto';

const a = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '115730194473734',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '16469076883',
              phone_number_id: '111491931567355',
            },
            contacts: [
              { profile: { name: 'Rishabh Rawat' }, wa_id: '918587808715' },
            ],
            messages: [
              {
                from: '918587805615',
                id: 'wamid.HBgMOTE4NTg3ODA1NjE1FQIAEhggQjEwMjM1QzQyQUM4MEQ1MURCQjhBQjBFREFFMkQwM0MA',
                timestamp: '1653161271',
                text: { body: 'Thank you so much' },
                type: 'text',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

@Injectable()
export class WhatsappService {
  receiveMessage(data: any) {
    const message = data.entry[0].changes[0].value.messages[0].text.body;

    console.log(
      'name:',
      data.entry[0].changes[0].value.contacts[0].profile.name,
    );
    console.log(
      'phone:',
      data.entry[0].changes[0].value.metadata.display_phone_number,
    );

    console.log('message:', message);

    return message;
  }

  findAll() {
    return `This action returns all whatsapp`;
  }

  findOne(id: number) {
    return `This action returns a #${id} whatsapp`;
  }

  update(id: number, updateWhatsappDto: UpdateWhatsappDto) {
    return `This action updates a #${id} whatsapp`;
  }

  remove(id: number) {
    return `This action removes a #${id} whatsapp`;
  }
}
