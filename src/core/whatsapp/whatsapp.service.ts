import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { formatInTimeZone } from 'date-fns-tz';
import { User, UserAddress } from '../users/entities/user.entity';
import { PaymentMethod, UserTypes } from 'src/common/enums';
import { OrderService } from '../order/order.service';
import { UploadService } from '../upload/upload.service';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import {
  IST_TZ,
  computeCurrentWindowStart,
  computeNextWindowStart,
} from '../share-catlaog/share-catlaog.window';

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
    @InjectRepository(ShareCatalog)
    private readonly shareCatalogRepository: Repository<ShareCatalog>,
    private configService: ConfigService,
    private orderService: OrderService,
    private uploadService: UploadService,
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

      const phone: string =
        data.entry[0]?.changes[0]?.value?.messages[0]?.from;

      if (!phone) {
        return;
      }

      const existingUser = await this.userRepository.findOne({
        where: { phone },
      });

      if (!existingUser) {
        await this.userRepository.save(
          this.userRepository.create({
            name: '',
            password: 'customer-password',
            phone,
            userType: UserTypes.CUSTOMER,
          }),
        );
        return this.sendNamePromptMessage(phone);
      }

      if (!existingUser.name || !existingUser.name.trim()) {
        if (type === 'text') {
          const text =
            data.entry[0].changes[0].value.messages[0].text?.body?.trim() || '';
          if (!text) {
            return this.sendNamePromptMessage(phone);
          }
          existingUser.name = text.slice(0, 100);
          await this.userRepository.save(existingUser);
          return this.sendWelcomeMessage(existingUser.name, phone);
        }
        return this.sendNamePromptMessage(phone, true);
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
        return this.sendWelcomeMessage(existingUser.name, phone);
      }

      if (type == 'interactive') {
        const interactive =
          data.entry[0].changes[0].value.messages[0].interactive;
        const interactiveType = interactive.type;

        if (interactiveType === 'button_reply' || interactiveType === 'list_reply') {
          const replyId =
            interactiveType === 'button_reply'
              ? interactive.button_reply.id
              : interactive.list_reply.id;
          return this.handleInteractiveReply(phone, replyId);
        } else if (interactiveType === 'nfm_reply') {
          const formData = interactive.nfm_reply.response_json;
          return this.receiveAddress(phone, formData);
        }
      }

      if (type == 'image') {
        const mediaId = data.entry[0].changes[0].value.messages[0].image?.id;
        if (mediaId) {
          return this.handlePaymentScreenshot(phone, mediaId);
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

      const response = await this.waInstance.post('/messages', payload);
      console.log('Message sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  private async sendNamePromptMessage(phone: string, isReprompt = false) {
    try {
      const body = isReprompt
        ? 'Please share your name first to continue. Reply with your name.'
        : 'Hi! Welcome to D-Fresh. Please reply with your name to get started.';

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body },
      };

      const response = await this.waInstance.post('/messages', payload);
      console.log('Name prompt sent:', response.data);
    } catch (error: any) {
      console.error(
        'Error sending name prompt:',
        error.response?.data || error.message,
      );
    }
  }

  /**
   * Broadcast entry point — fired when a share catalog window opens.
   * Sends a short promo intro then the interactive product list (the catalog
   * is served from our own DB, not a Meta catalog message).
   */
  async sendProduct(phone: string) {
    try {
      const catalog = await this.getOpenCatalog();
      if (!catalog) {
        return this.sendOffHoursMessage(phone);
      }

      await this.sendText(
        phone,
        "Hey! Our fresh catalog is live now 🥬\nTap below to browse and place your order.",
      );

      return this.sendProductList(phone);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive step-by-step order wizard
  // ---------------------------------------------------------------------------

  private async handleInteractiveReply(phone: string, replyId: string) {
    if (!replyId) return;

    const [action, ...parts] = replyId.split('~');

    switch (action) {
      case 'pickWeight':
        return this.sendWeightList(phone, parts[0]);
      case 'prodPage':
        return this.sendProductList(phone, parseInt(parts[0], 10) || 0);
      case 'pickVariant':
        return this.askCleaning(phone, parts[0]);
      case 'clean':
        // parts: [variantId, 'y' | 'n']
        return this.askCutting(phone, parts[0], parts[1]);
      case 'cut':
        // parts: [variantId, clean, 'y' | 'n']
        return parts[2] === 'y'
          ? this.askCuttingOption(phone, parts[0], parts[1])
          : this.sendItemSummary(phone, parts[0], parts[1], 'n', 'none');
      case 'cutopt':
        // parts: [variantId, clean, option]
        return this.sendItemSummary(phone, parts[0], parts[1], 'y', parts[2]);
      case 'place':
        // parts: [variantId, clean, cut, cuttingOption]
        return this.placeItem(phone, parts[0], parts[1], parts[2], parts[3]);
      case 'cancelItem':
        return this.handleCancelItem(phone);
    }

    // Legacy hyphen-prefixed actions (catalog entry / address / payment)
    if (replyId === 'get-catlog') {
      return this.sendProductList(phone);
    } else if (replyId.startsWith('confirmAddress-')) {
      return this.handleConfirmAddress(phone, replyId.replace('confirmAddress-', ''));
    } else if (replyId.startsWith('addAddress-')) {
      return this.sendAddressFlowForm(phone, replyId.replace('addAddress-', ''));
    } else if (replyId.startsWith('selectPaymentCOD-')) {
      return this.handleSelectCOD(phone, replyId.replace('selectPaymentCOD-', ''));
    } else if (replyId.startsWith('selectPaymentUPI-')) {
      return this.handleSelectUPI(phone, replyId.replace('selectPaymentUPI-', ''));
    }
  }

  /** Returns the ShareCatalog whose day/time window is currently open, or null. */
  private async getOpenCatalog(): Promise<any | null> {
    const activeCatalogs = await this.shareCatalogRepository.find({
      where: { isActive: true, isDeleted: false },
      relations: {
        ShareCatalogProducts: {
          product: true,
          variant: { cuttingStyles: true },
        },
      },
    });

    const now = new Date();
    return (
      activeCatalogs.find((c) =>
        computeCurrentWindowStart(now, c.daysOfWeek, c.startTime, c.endTime),
      ) ?? null
    );
  }

  /** Finds the open catalog's entry for a given variant, or null. */
  private async findCatalogEntry(variantId: string): Promise<any | null> {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return null;
    return (
      (catalog.ShareCatalogProducts ?? []).find(
        (e: any) => e.variantId === variantId && e.variant,
      ) ?? null
    );
  }

  async sendProductList(phone: string, page = 0) {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return this.sendOffHoursMessage(phone);

    const entries = (catalog.ShareCatalogProducts ?? []).filter(
      (e: any) => e.variantId && e.variant && e.product,
    );

    // Dedupe by product, preserving first-seen order.
    const seen = new Set<string>();
    const products: { id: string; name: string }[] = [];
    for (const e of entries) {
      if (seen.has(e.productId)) continue;
      seen.add(e.productId);
      products.push({ id: e.productId, name: e.product.name });
    }

    if (products.length === 0) {
      return this.sendText(phone, 'No products available right now.');
    }

    const LIST_MAX = 10;
    const PAGE_SIZE = 9;
    let pageProducts: { id: string; name: string }[];
    let moreRow = false;

    if (products.length <= LIST_MAX) {
      pageProducts = products;
    } else {
      const start = page * PAGE_SIZE;
      pageProducts = products.slice(start, start + PAGE_SIZE);
      if (pageProducts.length === 0) {
        return this.sendProductList(phone, 0); // out-of-range page, restart
      }
      moreRow = start + PAGE_SIZE < products.length;
    }

    const rows: any[] = pageProducts.map((p) => ({
      id: `pickWeight~${p.id}`,
      title: this.truncate(p.name, 24),
    }));
    if (moreRow) {
      rows.push({ id: `prodPage~${page + 1}`, title: 'More products' });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Our Products' },
        body: {
          text: 'Tap a product to see available weights and place your order.',
        },
        footer: { text: 'Fresh to home™' },
        action: {
          button: 'View Products',
          sections: [{ title: 'Products', rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Product list sent:', response.data);
  }

  async sendWeightList(phone: string, productId: string) {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return this.sendOffHoursMessage(phone);

    const entries = (catalog.ShareCatalogProducts ?? []).filter(
      (e: any) => e.productId === productId && e.variantId && e.variant,
    );

    if (entries.length === 0) {
      await this.sendText(phone, 'Sorry, that product is no longer available.');
      return this.sendProductList(phone);
    }

    const productName = entries[0].product?.name ?? 'Product';

    const rows = entries.slice(0, 10).map((e: any) => ({
      id: `pickVariant~${e.variantId}`,
      title: this.truncate(this.formatWeight(e.variant), 24),
      description: `₹${e.price}`,
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.truncate(productName, 60) },
        body: { text: 'Choose a weight.' },
        footer: { text: 'Fresh to home™' },
        action: {
          button: 'Select Weight',
          sections: [{ title: 'Available Weights', rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Weight list sent:', response.data);
  }

  async askCleaning(phone: string, variantId: string) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, 'Sorry, that item is no longer available.');
      return this.sendProductList(phone);
    }

    if (!entry.variant.cleaning) {
      return this.askCutting(phone, variantId, 'n');
    }

    const charge = entry.variant.cleaningCharge ?? 0;
    const chargeText = charge > 0 ? ` (+₹${charge})` : '';

    return this.sendYesNoButtons(
      phone,
      `Would you like this item cleaned?${chargeText}`,
      `clean~${variantId}~y`,
      `clean~${variantId}~n`,
    );
  }

  async askCutting(phone: string, variantId: string, clean: string) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, 'Sorry, that item is no longer available.');
      return this.sendProductList(phone);
    }

    if (!entry.variant.cutting) {
      return this.sendItemSummary(phone, variantId, clean, 'n', 'none');
    }

    return this.sendYesNoButtons(
      phone,
      'Would you like this item cut?',
      `cut~${variantId}~${clean}~y`,
      `cut~${variantId}~${clean}~n`,
    );
  }

  async askCuttingOption(phone: string, variantId: string, clean: string) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, 'Sorry, that item is no longer available.');
      return this.sendProductList(phone);
    }

    const styles = (entry.variant.cuttingStyles ?? []).filter(
      (s: any) => !s.isDeleted,
    );

    if (styles.length === 0) {
      // Cutting enabled but no styles configured — skip cutting.
      return this.sendItemSummary(phone, variantId, clean, 'n', 'none');
    }

    const rows = styles.slice(0, 10).map((s: any) => ({
      id: `cutopt~${variantId}~${clean}~${s.style}`,
      title: this.truncate(s.style, 24),
      description: s.price > 0 ? `+₹${s.price}` : 'Free',
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: 'How would you like it cut?' },
        footer: { text: 'Fresh to home™' },
        action: {
          button: 'Choose Cut',
          sections: [{ title: 'Cutting Options', rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Cutting options sent:', response.data);
  }

  async sendItemSummary(
    phone: string,
    variantId: string,
    clean: string,
    cut: string,
    cuttingOption: string,
  ) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, 'Sorry, that item is no longer available.');
      return this.sendProductList(phone);
    }

    const productName = entry.product?.name ?? 'Product';
    const weight = this.formatWeight(entry.variant);
    const price = entry.price;

    const cleaningCharge =
      clean === 'y' ? entry.variant.cleaningCharge ?? 0 : 0;
    const cuttingCharge =
      cut === 'y' ? this.getCuttingPrice(entry.variant, cuttingOption) : 0;
    const total = price + cleaningCharge + cuttingCharge;

    const lines = [`${productName} — ${weight}`, `Base price: ₹${price}`];
    if (clean === 'y') {
      lines.push(`Cleaning: +₹${cleaningCharge}`);
    }
    if (cut === 'y') {
      const label =
        cuttingOption && cuttingOption !== 'none'
          ? `Cutting (${cuttingOption})`
          : 'Cutting';
      lines.push(`${label}: +₹${cuttingCharge}`);
    }

    const body =
      `🧾 *Order Summary*\n\n` +
      lines.join('\n') +
      `\n\n*Total: ₹${total}*`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        footer: { text: 'Fresh to home™' },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `place~${variantId}~${clean}~${cut}~${cuttingOption}`,
                title: 'Confirm Order',
              },
            },
            {
              type: 'reply',
              reply: { id: 'cancelItem', title: 'Cancel' },
            },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Item summary sent:', response.data);
  }

  async placeItem(
    phone: string,
    variantId: string,
    clean: string,
    cut: string,
    cuttingOption: string,
  ) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, 'Sorry, that item is no longer available.');
      return this.sendProductList(phone);
    }

    const resolvedCuttingOption =
      cut === 'y' && cuttingOption && cuttingOption !== 'none'
        ? cuttingOption
        : null;

    const products = [
      {
        product_retailer_id: variantId,
        quantity: '1',
        item_price: entry.price,
        cleaning: clean === 'y',
        // Charges are resolved server-side from the variant, never trusted
        // from the interactive reply payload.
        cleaningCharge: clean === 'y' ? entry.variant.cleaningCharge ?? 0 : 0,
        cutting: cut === 'y',
        cuttingOption: resolvedCuttingOption,
        cuttingCharge:
          cut === 'y' ? this.getCuttingPrice(entry.variant, resolvedCuttingOption) : 0,
      },
    ];

    return this.createOrder(phone, products);
  }

  /** Returns the price of a cutting style on a variant, or 0 if not found. */
  private getCuttingPrice(variant: any, style: string | null): number {
    if (!style || style === 'none') return 0;
    const match = (variant?.cuttingStyles ?? []).find(
      (s: any) => !s.isDeleted && s.style === style,
    );
    return match?.price ?? 0;
  }

  private async handleCancelItem(phone: string) {
    await this.sendText(phone, 'No problem — here are the products again.');
    return this.sendProductList(phone);
  }

  private async sendOffHoursMessage(phone: string) {
    const activeCatalogs = await this.shareCatalogRepository.find({
      where: { isActive: true, isDeleted: false },
    });

    const now = new Date();
    let nextStart: Date | null = null;
    for (const c of activeCatalogs) {
      const candidate = computeNextWindowStart(now, c.daysOfWeek, c.startTime);
      if (candidate && (!nextStart || candidate < nextStart)) {
        nextStart = candidate;
      }
    }

    const body = nextStart
      ? `We're not in active hours right now.\nOur next active window opens on ${formatInTimeZone(
          nextStart,
          IST_TZ,
          "EEE, d MMM 'at' h:mm a",
        )} IST.\nPlease message us then.`
      : `We're not in active hours right now. Please check back later.`;

    return this.sendText(phone, body);
  }

  private async sendYesNoButtons(
    phone: string,
    bodyText: string,
    yesId: string,
    noId: string,
  ) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        footer: { text: 'Fresh to home™' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: yesId, title: 'Yes' } },
            { type: 'reply', reply: { id: noId, title: 'No' } },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Yes/No buttons sent:', response.data);
  }

  private async sendText(phone: string, body: string) {
    await this.waInstance.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { body },
    });
  }

  private formatWeight(variant: any): string {
    return `${variant.weight} ${variant.unit}`;
  }

  private truncate(text: string, max: number): string {
    if (!text) return '';
    return text.length <= max ? text : text.slice(0, max - 1) + '…';
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

      if (order) {
        await this.sendPaymentMethodButtons(phone, order.id, order.totalAmount);
      }
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
      if (order) {
        await this.sendPaymentMethodButtons(phone, order.id, order.totalAmount);
      }
    } catch (error) {
      console.error('Error receiving address:', error);
    }
  }

  async sendOrderConfirmationMessage(phone: string, order: any) {
    if (!order) return;

    const itemLines = order.orderItems
      .map((item: any) => {
        const addOns: string[] = [];
        if (item.cleaning) addOns.push(`Cleaning +₹${item.cleaningCharge ?? 0}`);
        if (item.cutting) {
          const label = item.cuttingOption
            ? `Cut ${item.cuttingOption}`
            : 'Cutting';
          addOns.push(`${label} +₹${item.cuttingCharge ?? 0}`);
        }
        const addOnText = addOns.length ? ` (${addOns.join(', ')})` : '';
        return `• ${item.product?.name ?? 'Product'} - ${item.quantity} Kg${addOnText} - ₹${item.totalPrice}`;
      })
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

  private async sendPaymentMethodButtons(
    phone: string,
    orderId: string,
    amount: number,
  ) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text:
            `Your order is ready!\n\n` +
            `*Total: ₹${Number(amount).toFixed(2)}*\n\n` +
            `Choose your payment method:`,
        },
        footer: { text: 'Fresh to home™' },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: `selectPaymentCOD-${orderId}`, title: 'Cash on Delivery' },
            },
            {
              type: 'reply',
              reply: { id: `selectPaymentUPI-${orderId}`, title: 'UPI Payment' },
            },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Payment method buttons sent:', response.data);
  }

  private async handleSelectCOD(phone: string, orderId: string) {
    try {
      const order = await this.orderService.selectPaymentMethod(
        orderId,
        PaymentMethod.COD,
      );
      if (!order) return;
      await this.sendCodConfirmationMessage(phone, order);
    } catch (error) {
      console.error('Error selecting COD:', error);
    }
  }

  private async sendCodConfirmationMessage(phone: string, order: any) {
    const d = order.deliveryDetails;
    const addressLines = d
      ? `${d.name}\n${d.address}, ${d.pinCode}\nPhone: ${d.phone}`
      : 'Address not available';

    const body =
      `✅ *Order Confirmed!*\n\n` +
      `Payment Method: *Cash on Delivery*\n` +
      `Please pay *₹${Number(order.totalAmount).toFixed(2)}* in cash when your order arrives.\n\n` +
      `📍 *Delivery Address:*\n${addressLines}\n\n` +
      `_Further order updates will be notified to you on WhatsApp._`;

    await this.waInstance.post('/messages', {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    });
  }

  private async handleSelectUPI(phone: string, orderId: string) {
    try {
      const order = await this.orderService.selectPaymentMethod(
        orderId,
        PaymentMethod.UPI,
      );
      if (!order) return;

      const qrBuffer = await this.generateUpiQrBuffer(order.id, order.totalAmount);
      const { url } = await this.uploadService.uploadFile({
        buffer: qrBuffer,
        mimetype: 'image/png',
        originalname: `upi-qr-${order.id.slice(0, 8)}.png`,
      });

      await this.sendUpiQrImage(phone, url, order.totalAmount);
    } catch (error) {
      console.error('Error selecting UPI:', error);
    }
  }

  private async generateUpiQrBuffer(orderId: string, amount: number): Promise<Buffer> {
    const vpa = this.configService.get<string>('MERCHANT_UPI_VPA');
    const name = this.configService.get<string>('MERCHANT_DISPLAY_NAME') || 'D-Fresh';
    const tn = `order-${orderId.slice(0, 8)}`;
    const upiUri =
      `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}` +
      `&am=${Number(amount).toFixed(2)}&cu=INR&tn=${tn}`;
    return QRCode.toBuffer(upiUri, { type: 'png', width: 512, margin: 2 });
  }

  private async sendUpiQrImage(phone: string, qrUrl: string, amount: number) {
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'image',
      image: {
        link: qrUrl,
        caption:
          `Scan this QR to pay *₹${Number(amount).toFixed(2)}*.\n\n` +
          `After paying, *reply with the payment screenshot* in this chat to confirm your order.`,
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('UPI QR sent:', response.data);
  }

  private async handlePaymentScreenshot(phone: string, mediaId: string) {
    try {
      console.log('image');
      const order = await this.orderService.findAwaitingScreenshotOrderByPhone(phone);
      if (!order) {
        await this.waInstance.post('/messages', {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: {
            body:
              `We couldn't find a pending UPI payment for your number.\n` +
              `If you've just paid, please place your order again or contact support.`,
          },
        });
        return;
      }

      const { buffer, mimetype } = await this.downloadWhatsAppMedia(mediaId);
      const { url } = await this.uploadService.uploadFile({
        buffer,
        mimetype,
        originalname: `payment-screenshot-${order.id.slice(0, 8)}.jpg`,
      });

      await this.orderService.attachPaymentScreenshot(order.id, url);

      await this.waInstance.post('/messages', {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: {
          body:
            `✅ Thanks! Your payment screenshot has been received.\n\n` +
            `We'll verify the payment and confirm your order shortly.`,
        },
      });
    } catch (error) {
      console.error('Error handling payment screenshot:', error);
    }
  }

  private async downloadWhatsAppMedia(
    mediaId: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const metaRes = await axios.get(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${this.waUserToken}` } },
    );
    const mediaUrl: string = metaRes.data.url;
    const mimetype: string = metaRes.data.mime_type || 'image/jpeg';

    const binRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${this.waUserToken}` },
      responseType: 'arraybuffer',
    });

    return { buffer: Buffer.from(binRes.data), mimetype };
  }
}
