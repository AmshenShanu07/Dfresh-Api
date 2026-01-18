import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ReceiveMessageDto } from './dto/receive-message.dto';
import { Products, UserTypes } from '@prisma/client';
import { PrismaService } from 'src/services/prisma.service';


@Injectable()
export class WhatsappService {
  private readonly botToken: string;
  private readonly tgChatId: string;
  private readonly waPhoneNumberId: string;
  private readonly waUserToken: string;

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService
  ) {
    this.botToken = this.configService.get<string>('BOT_TOKEN');
    this.tgChatId = this.configService.get<string>('TG_CHAT_ID');
    this.waPhoneNumberId = this.configService.get<string>('WA_PHONE_NUMBER_ID');
    this.waUserToken = this.configService.get<string>('WA_USER_TOKEN');
  }

  async receiveMessage(data: ReceiveMessageDto) {
    try {

      await this.sendLog(JSON.stringify(data));
  
      const type: string = data.entry[0]?.changes[0]?.value?.messages[0]?.type || '';
      
      if (!type) {
        return 'This action only accepts text messages'
      };
  
      if (type == 'interactive') {
        const btnId = data.entry[0].changes[0].value.messages[0].interactive.button_reply.id;
  
        if (btnId === 'get-catlog') {
          const phone = data.entry[0].changes[0].value.messages[0].from;
          return this.sendProduct(phone);
        }
  
        return 'This action only accepts text messages';
      }

      if(type == 'order') {
        // {"object":"whatsapp_business_account","entry":[{"id":"1883543198870590","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"917559903011","phone_number_id":"769195252945723"},"contacts":[{"profile":{"name":"sh4nu"},"wa_id":"917012670512"}],"messages":[{"from":"917012670512","id":"wamid.HBgMOTE3MDEyNjcwNTEyFQIAEhgUM0FEODI1RTM0NkZFQ0E5NUU3OUQA","timestamp":"1768724525","type":"order","order":{"catalog_id":"1978442546302613","text":"","product_items":[{"product_retailer_id":"cmk9dpnel0005ufrl14mn4c7l","quantity":1,"item_price":1,"currency":"INR"},{"product_retailer_id":"cmk9dmwzi0001ufrlnzf52jc1","quantity":1,"item_price":5,"currency":"INR"},{"product_retailer_id":"cmk9dr1hv0007ufrlqf4mayq6","quantity":1,"item_price":7.5,"currency":"INR"}]}}]},"field":"messages"}]}]}
        await this.createOrder(
          data.entry[0].changes[0].value.messages[0].from, 
          data.entry[0].changes[0].value.messages[0].order.product_items
        );
        return 'Order created successfully';
      }



  
  
      const message = data.entry[0].changes[0].value.messages[0].text.body;
      const name = data.entry[0].changes[0].value.contacts[0].profile.name;
      const phone = data.entry[0].changes[0].value.messages[0].from;
  
      if (message === '/start') await this.sendWelcomeMessage(name, phone);
  
      return message;
    } catch (error) {
      // console.error(error);
      return 'This action only accepts text messages';
    }
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
        body: {
          text: `Hey ${name}!\n Welcome to Dfresh! \n Please checkout our catlog for the best deals!`,
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
      const user = await this.prismaService.user.findFirst({
        where: {
          phone: phone,
        },
      });

      if (!user) {
        await this.prismaService.user.create({
          data: {
            name: name,
            password: 'customer-password',
            phone: phone,
            userType: UserTypes.CUSTOMER,
          },
        });
      }

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

    const products = await this.prismaService.products.findMany({
      where: {
        isActive: true,
        isDeleted: false,
      },
      select: {
        id: true,
        catalogId: true,
      }
    });

    if(!products || products?.length === 0) return 'No products found';

    const randomIndex = Math.floor(Math.random() * products.length);
    const productId = products[randomIndex].id;
    
    if(!productId) {
      console.log('No product id found');
      return 'No products found';
    }
    
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
            thumbnail_product_retailer_id: productId
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
    console.log('----------- LOGGING -----------');
    console.log(log);
    console.log('----------- LOGGING -----------');
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

  async createOrder(phone: string, products: any[]){
    const user = await this.prismaService.user.findFirst({
      where: {
        phone: phone,
        userType: UserTypes.CUSTOMER,
      },
    });

    if(!user) return 'User not found';

    const order = await this.prismaService.orderDetails.create({
      data: {
        userId: user.id,
        totalAmount: products.reduce((acc, product) => acc + product.item_price * product.quantity, 0),
      },
    });

    if(!order) return 'Order not created';

    await Promise.all(products.map(async (product) => {
      this.prismaService.orderItems.create({
        data: {
          orderId: order.id,
          productId: product.product_retailer_id,
          quantity: product.quantity,
          price: product.item_price,
          totalPrice: product.item_price * product.quantity,
        },
      });
    }));

    return 'Order created successfully';
  }
}
