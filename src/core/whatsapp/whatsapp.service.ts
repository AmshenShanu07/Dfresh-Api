import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ReceiveMessageDto } from './dto/receive-message.dto';
import { UserTypes } from '@prisma/client';
import { PrismaService } from 'src/services/prisma.service';
import { OrderService } from '../order/order.service';
import { ProductService } from '../product/product.service';


@Injectable()
export class WhatsappService {
  private readonly botToken: string;
  private readonly tgChatId: string;
  private readonly waPhoneNumberId: string;
  private readonly waUserToken: string;
  private readonly waInstance: AxiosInstance;

  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private orderService: OrderService,
    private productService: ProductService
  ) {
    this.botToken = this.configService.get<string>('BOT_TOKEN');
    this.tgChatId = this.configService.get<string>('TG_CHAT_ID');
    this.waPhoneNumberId = this.configService.get<string>('WA_PHONE_NUMBER_ID');
    this.waUserToken = this.configService.get<string>('WA_USER_TOKEN');
    this.waInstance = axios.create({
      baseURL: `https://graph.facebook.com/v22.0/${this.waPhoneNumberId}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.waUserToken}`,
      },
    });
  }

  async receiveMessage(data: ReceiveMessageDto) {
    try {

      await this.sendLog(JSON.stringify(data));
  
      const type: string = data.entry[0]?.changes[0]?.value?.messages[0]?.type || '';
      
      if (!type) {
        return 'This action only accepts text messages'
      };

      // Place Order
      if(type == 'order') {
        console.log('Order received', data.entry[0].changes[0].value.messages[0].order);
        await this.createOrder(
          data.entry[0].changes[0].value.messages[0].from, 
          data.entry[0].changes[0].value.messages[0].order.product_items
        );
      }

      if(type == 'text') {
        console.log('Text received', data.entry[0].changes[0].value.messages[0].text);
        // const message = data.entry[0].changes[0].value.messages[0].text.body;
        const name = data.entry[0].changes[0].value.contacts[0].profile.name;
        const phone = data.entry[0].changes[0].value.messages[0].from;
        return this.sendWelcomeMessage(name, phone);
      }



  
      if (type == 'interactive') {

        const intrativeType = data.entry[0].changes[0].value.messages[0].interactive.type;
        const phone = data.entry[0].changes[0].value.messages[0].from;



        if(intrativeType === 'button_reply') {
          const btnId = data.entry[0].changes[0].value.messages[0].interactive.button_reply.id;
          
          if (btnId === 'get-catlog') {
            return this.sendProduct(phone);
          }

        } else if(intrativeType === 'nfm_reply') {
          //Address Flow Response
          const formData = data.entry[0].changes[0].value.messages[0].interactive.nfm_reply.response_json;
          return this.receiveAddress(phone, formData);

        }

      }


  
  
    } catch (error) {
      console.error(error);
    }
  }


  async sendWelcomeMessage(name: string, phone: string) {    
    try {

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `Hey ${name}!\nWelcome to Dfresh! \nPlease checkout our catlog for the best deals!`,
          },
          footer: {
            text: 'Fresh to home™',
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

      const response = await this.waInstance.post('/messages', payload);

      console.log('Message sent:', response.data);
    } catch (error) {
      console.error(
        'Error sending message:',
        error.response?.data || error.message,
      );
    }
  }

  async sendProduct(phone: string) {
    try {
      const productId = await this.productService.getRandomProductId();

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'catalog_message',
          body: {
            text: 'Hey! Thank you for your interest. It\'s easy to order from our catalog. Please check our catalog and add items to your order.',
          },
          footer: {
            text: 'Fresh to home™',
          },
          action: {
            name: 'catalog_message',
            parameters: {
              thumbnail_product_retailer_id: productId
            },
          }
        },
      };

      const response = await this.waInstance.post('/messages', payload);

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

  async createOrder(phone: string, products: any[]) {
    try {
      
      const order = await this.orderService.createOrder(phone, products);
      if(!order) return 'Order creation failed';

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: 'Please share your delivery address' },
          footer: { text: 'Fresh to home™' },
          action: {
            name: "flow",
            parameters: {
              flow_message_version: "3",
              flow_id: "902959149367544",
              flow_cta: "Enter Address",
              flow_token: order.id
            }
          }
        },
      };
  
      const response = await this.waInstance.post('/messages', payload);
  
      console.log('Message sent:', response.data);
  
    } catch (error) {
      console.error('Error creating order:', error);
    }


  }

  async receiveAddress(phone: string, address: string) {
    try {

      const addressData = JSON.parse(address);
      const order = await this.orderService.updateOrderAddress(addressData);
  
      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        footer: { text: 'Fresh to home™' },
        text: {
          body: `Your order has been confirmed successfully.\nYour order details:\n${order.orderItems.map((item) => `${item.product.name} - ${item.quantity} Kg - Rs.${item.price}`).join('\n')}\nTotal Amount: ${order.totalAmount}\nThank you for your order!`,
        },
      }
      
  
      this.waInstance.post('/messages', payload);
    } catch (error) {
      console.error('Error receiving address:', error);
    }

  }
}
