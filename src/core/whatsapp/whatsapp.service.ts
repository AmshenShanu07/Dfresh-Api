import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserAddress } from '../users/entities/user.entity';
import { UserTypes } from 'src/common/enums';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    private configService: ConfigService,
    private orderService: OrderService,
    private productService: ProductService,
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

  async receiveMessage(data: any) {
    try {
      await this.sendLog(JSON.stringify(data));

      const type: string =
        data.entry[0]?.changes[0]?.value?.messages[0]?.type || '';

      if (!type) {
        return 'This action only accepts text messages';
      }

      if (type == 'order') {
        console.log('Order received', data.entry[0].changes[0].value.messages[0].order);
        await this.createOrder(
          data.entry[0].changes[0].value.messages[0].from,
          data.entry[0].changes[0].value.messages[0].order.product_items,
        );
      }

      if (type == 'text') {
        console.log('Text received', data.entry[0].changes[0].value.messages[0].text);
        const name = data.entry[0].changes[0].value.contacts[0].profile.name;
        const phone = data.entry[0].changes[0].value.messages[0].from;
        return this.sendWelcomeMessage(name, phone);
      }

      if (type == 'interactive') {
        const interactiveType =
          data.entry[0].changes[0].value.messages[0].interactive.type;
        const phone = data.entry[0].changes[0].value.messages[0].from;

        if (interactiveType === 'button_reply') {
          const btnId =
            data.entry[0].changes[0].value.messages[0].interactive.button_reply.id;

          if (btnId === 'get-catlog') {
            return this.sendProduct(phone);
          } else if (btnId.startsWith('confirmAddress-')) {
            const orderId = btnId.replace('confirmAddress-', '');
            return this.handleConfirmAddress(phone, orderId);
          } else if (btnId.startsWith('addAddress-')) {
            const orderId = btnId.replace('addAddress-', '');
            return this.sendAddressFlowForm(phone, orderId);
          }
        } else if (interactiveType === 'nfm_reply') {
          const formData =
            data.entry[0].changes[0].value.messages[0].interactive.nfm_reply.response_json;
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
          footer: { text: 'Fresh to home™' },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: 'get-catlog', title: 'See Products' },
              },
            ],
          },
        },
      };

      const user = await this.userRepository.findOne({ where: { phone } });

      if (!user) {
        await this.userRepository.save(
          this.userRepository.create({
            name,
            password: 'customer-password',
            phone,
            userType: UserTypes.CUSTOMER,
          }),
        );
      }

      const response = await this.waInstance.post('/messages', payload);
      console.log('Message sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
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
            text: "Hey! Thank you for your interest. It's easy to order from our catalog. Please check our catalog and add items to your order.",
          },
          footer: { text: 'Fresh to home™' },
          action: {
            name: 'catalog_message',
            parameters: { thumbnail_product_retailer_id: productId },
          },
        },
      };

      const response = await this.waInstance.post('/messages', payload);
      console.log('Message sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  async sendLog(log: string) {
    console.log('----------- LOGGING -----------');
    console.log(log);
    console.log('----------- LOGGING -----------');
    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.tgChatId,
        text: log,
      });
      console.log('TG Logged!');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async createOrder(phone: string, products: any[]) {
    try {
      const order = await this.orderService.createOrder(phone, products);
      if (!order) return 'Order creation failed';

      const user = await this.userRepository.findOne({ where: { phone } });
      if (!user) return;

      const existingAddress = await this.userAddressRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });

      if (existingAddress) {
        await this.sendAddressConfirmationButtons(phone, order.id, existingAddress);
      } else {
        await this.sendAddressFlowForm(phone, order.id);
      }
    } catch (error) {
      console.error('Error creating order:', error);
    }
  }

  private async sendAddressFlowForm(phone: string, orderId: string) {
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'Please share your delivery address' },
        footer: { text: 'Fresh to home™' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: '902959149367544',
            flow_cta: 'Enter Address',
            flow_token: orderId,
          },
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Address form sent:', response.data);
  }

  private async sendAddressConfirmationButtons(
    phone: string,
    orderId: string,
    address: UserAddress,
  ) {
    const addressText =
      `Please verify your delivery address:\n\n` +
      `Name: ${address.name}\n` +
      `Address: ${address.address}\n` +
      `Pin Code: ${address.pinCode}\n` +
      `Phone: ${address.phone}\n\n` +
      `Is this correct?`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: addressText },
        footer: { text: 'Fresh to home™' },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: `confirmAddress-${orderId}`, title: 'Confirm Address' },
            },
            {
              type: 'reply',
              reply: { id: `addAddress-${orderId}`, title: 'Add New Address' },
            },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Address confirmation sent:', response.data);
  }

  private async handleConfirmAddress(phone: string, orderId: string) {
    try {
      const user = await this.userRepository.findOne({ where: { phone } });
      if (!user) return;

      const address = await this.userAddressRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });

      if (!address) {
        return this.sendAddressFlowForm(phone, orderId);
      }

      const order = await this.orderService.confirmOrderWithAddress(orderId, {
        name: address.name,
        address: address.address,
        pinCode: address.pinCode,
        phone: address.phone,
      });

      await this.sendOrderConfirmationMessage(phone, order);
    } catch (error) {
      console.error('Error confirming address:', error);
    }
  }

  async receiveAddress(phone: string, addressJsonString: string) {
    try {
      const addressData = JSON.parse(addressJsonString);

      const user = await this.userRepository.findOne({ where: { phone } });
      if (user) {
        await this.userAddressRepository.save(
          this.userAddressRepository.create({
            userId: user.id,
            name: addressData.name,
            address: addressData.address,
            pinCode: addressData.pincode,
            phone: addressData.phone,
          }),
        );
      }

      const order = await this.orderService.updateOrderAddress(addressData);
      await this.sendOrderConfirmationMessage(phone, order);
    } catch (error) {
      console.error('Error receiving address:', error);
    }
  }

  private async sendOrderConfirmationMessage(phone: string, order: any) {
    if (!order) return;

    const itemLines = order.orderItems
      .map((item: any) => `• ${item.product?.name ?? 'Product'} - ${item.quantity} Kg - ₹${item.price}`)
      .join('\n');

    const d = order.deliveryDetails;
    const addressLines = d
      ? `${d.name}\n${d.address}, ${d.pinCode}\nPhone: ${d.phone}`
      : 'Address not available';

    const body =
      `✅ *Order Placed Successfully!*\n\n` +
      `📦 *Your Order:*\n${itemLines}\n\n` +
      `*Total Amount: ₹${order.totalAmount}*\n\n` +
      `📍 *Delivery Address:*\n${addressLines}\n\n` +
      `_Further order updates will be notified to you on WhatsApp._`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    };

    await this.waInstance.post('/messages', payload);
  }
}
