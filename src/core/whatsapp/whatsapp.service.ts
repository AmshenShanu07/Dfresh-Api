import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { formatInTimeZone } from 'date-fns-tz';
import { User, UserAddress } from '../users/entities/user.entity';
import {
  MeasurementType,
  OrderStatus,
  PaymentMethod,
  ShareCatalogStatus,
  UserTypes,
} from 'src/common/enums';
import { OrderService } from '../order/order.service';
import { InvoiceService } from '../order/invoice.service';
import { deriveOrderNumber } from '../order/order-number.util';
import { UploadService } from '../upload/upload.service';
import { CartService } from '../cart/cart.service';
import { WardService } from '../ward/ward.service';
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
    private cartService: CartService,
    private wardService: WardService,
    private invoiceService: InvoiceService,
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

      const value = data.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      // Delivery/read status callbacks (value.statuses) and any other
      // non-message events carry no `messages` array — ignore them so we don't
      // throw on the missing index.
      if (!message) {
        return;
      }

      const type: string = message.type || '';

      if (!type) {
        return 'This action only accepts text messages';
      }

      const phone: string = message.from;

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
          return this.promptWardIfNoAddress(existingUser.id, phone);
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
        const body = message.text?.body?.trim() ?? '';
        console.log('Text received', message.text);
        // A greeting/first contact shows the welcome; any other free text shows
        // the main menu instead of bouncing the user back to onboarding.
        if (/^(hi|hello|hey|hai|start|menu)$/i.test(body)) {
          return this.sendWelcomeMessage(existingUser.name, phone);
        }
        return this.sendMainMenu(existingUser.name, phone);
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
      const cart = await this.cartService.getCart(phone);
      const buttons: any[] = [
        {
          type: 'reply',
          reply: { id: 'get-catlog', title: 'View Products' },
        },
      ];
      // Only offer "View Cart" when the customer actually has items in it.
      if ((cart?.cartItems?.length ?? 0) > 0) {
        buttons.push({
          type: 'reply',
          reply: { id: 'cartView', title: 'View Cart' },
        });
      }

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
            buttons,
          },
        },
      };

      const response = await this.waInstance.post('/messages', payload);
      console.log('Message sent:', response.data);
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  /** Main menu shown when a known customer sends arbitrary (non-greeting) text. */
  async sendMainMenu(name: string, phone: string) {
    try {
      const cart = await this.cartService.getCart(phone);
      const buttons: any[] = [
        {
          type: 'reply',
          reply: { id: 'get-catlog', title: 'View Products' },
        },
      ];
      // Only offer "View Cart" when the customer actually has items in it.
      if ((cart?.cartItems?.length ?? 0) > 0) {
        buttons.push({
          type: 'reply',
          reply: { id: 'cartView', title: 'View Cart' },
        });
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: `Hi ${name}! What would you like to do?`,
          },
          footer: { text: 'Fresh to home™' },
          action: {
            buttons,
          },
        },
      };

      const response = await this.waInstance.post('/messages', payload);
      console.log('Menu sent:', response.data);
    } catch (error: any) {
      console.error('Error sending menu:', error.response?.data || error.message);
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
        return this.sendUnavailableMessage(phone);
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
      case 'addToCart':
        // parts: [variantId, clean, cut, cuttingOption]
        return this.addItemToCart(phone, parts[0], parts[1], parts[2], parts[3]);
      case 'cancelItem':
        return this.handleCancelItem(phone);
      case 'cartView':
        return this.sendCartSummary(phone);
      case 'cartAddMore':
        return this.sendProductList(phone);
      case 'cartRemove':
        return this.sendCartRemoveList(phone);
      case 'cartDel':
        // parts: [cartItemId]
        return this.handleRemoveCartItem(phone, parts[0]);
      case 'cartBuyNow':
        return this.checkoutCart(phone);
      case 'pickWard':
        // parts: [wardId, orderId?]
        return this.sendAddressFlowForm(phone, parts[0], parts[1]);
      case 'wardPage':
        // parts: [page, orderId?]
        return this.sendWardList(phone, parseInt(parts[0], 10) || 0, parts[1]);
    }

    // Legacy hyphen-prefixed actions (catalog entry / address / payment)
    if (replyId === 'get-catlog') {
      return this.sendProductList(phone);
    } else if (replyId.startsWith('confirmAddress-')) {
      return this.handleConfirmAddress(phone, replyId.replace('confirmAddress-', ''));
    } else if (replyId.startsWith('addAddress-')) {
      return this.sendWardList(phone, 0, replyId.replace('addAddress-', ''));
    } else if (replyId.startsWith('selectPaymentCOD-')) {
      return this.handleSelectCOD(phone, replyId.replace('selectPaymentCOD-', ''));
    } else if (replyId.startsWith('selectPaymentUPI-')) {
      return this.handleSelectUPI(phone, replyId.replace('selectPaymentUPI-', ''));
    }
  }

  /** Returns the ShareCatalog whose day/time window is currently open, or null. */
  private async getOpenCatalog(): Promise<any | null> {
    const activeCatalogs = await this.shareCatalogRepository.find({
      where: {
        status: In([ShareCatalogStatus.ACTIVE, ShareCatalogStatus.LIVE]),
        isDeleted: false,
      },
      relations: {
        ShareCatalogProducts: {
          product: true,
          variant: { cuttingStyles: { cuttingStyle: true } },
        },
        ShareCatalogProductStock: true,
      },
    });

    const now = new Date();
    return (
      activeCatalogs.find((c) =>
        computeCurrentWindowStart(now, c.daysOfWeek, c.startTime, c.endTime),
      ) ?? null
    );
  }

  /**
   * A sold-out (PAUSED) catalog whose scheduled window is open right now, or
   * null. A catalog is auto-PAUSED when every product runs out of stock, so
   * this lets us tell an in-window customer "out of stock" rather than the
   * misleading off-hours message.
   */
  private async getSoldOutInWindowCatalog(): Promise<any | null> {
    const paused = await this.shareCatalogRepository.find({
      where: { status: ShareCatalogStatus.PAUSED, isDeleted: false },
    });

    const now = new Date();
    return (
      paused.find((c) =>
        computeCurrentWindowStart(now, c.daysOfWeek, c.startTime, c.endTime),
      ) ?? null
    );
  }

  /**
   * Chooses the right "can't serve products" reply. If a catalog's window is
   * open but it sold out (PAUSED), tell the customer it's out of stock;
   * otherwise fall back to the off-hours / next-window message.
   */
  private async sendUnavailableMessage(phone: string) {
    const soldOut = await this.getSoldOutInWindowCatalog();
    if (soldOut) return this.sendOutOfStockMessage(phone);
    return this.sendOffHoursMessage(phone);
  }

  private async sendOutOfStockMessage(phone: string) {
    return this.sendText(
      phone,
      'All products are currently out of stock. Please try again after some time.',
    );
  }

  /** Remaining offered grams for a product within the open catalog. */
  private remainingGramsFor(catalog: any, productId: string): number {
    const stock = (catalog?.ShareCatalogProductStock ?? []).find(
      (s: any) => s.productId === productId,
    );
    return stock?.remainingGrams ?? 0;
  }

  /**
   * A catalog entry (variant) is sellable only when its product still has
   * enough remaining allocation to cover the variant's weight.
   */
  private isEntrySellable(catalog: any, entry: any): boolean {
    const remaining = this.remainingGramsFor(catalog, entry.productId);
    const weight = entry.variant?.weight ?? Infinity;
    return remaining > 0 && weight <= remaining;
  }

  /** Finds the open catalog's entry for a given variant, or null. */
  private async findCatalogEntry(variantId: string): Promise<any | null> {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return null;
    const entry = (catalog.ShareCatalogProducts ?? []).find(
      (e: any) => e.variantId === variantId && e.variant,
    );
    if (!entry || !this.isEntrySellable(catalog, entry)) return null;
    return entry;
  }

  async sendProductList(phone: string, page = 0) {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return this.sendUnavailableMessage(phone);

    const entries = (catalog.ShareCatalogProducts ?? []).filter(
      (e: any) =>
        e.variantId &&
        e.variant &&
        e.product &&
        this.isEntrySellable(catalog, e),
    );

    // Group by product, preserving first-seen order, and track the lowest
    // per-unit price across each product's variants for the row subtitle. The
    // unit depends on the product's measurement family (per kg / per L / piece).
    type ProductRow = {
      id: string;
      name: string;
      cleaning: boolean;
      cutting: boolean;
      measurementType: MeasurementType;
      minUnitPrice: number | null;
      fallbackPrice: number;
    };
    const order: string[] = [];
    const byProduct = new Map<string, ProductRow>();
    for (const e of entries) {
      let agg = byProduct.get(e.productId);
      if (!agg) {
        agg = {
          id: e.productId,
          name: e.product.name,
          cleaning: !!e.product.cleaning,
          cutting: !!e.product.cutting,
          measurementType:
            e.product.measurementType ?? MeasurementType.WEIGHT,
          minUnitPrice: null,
          fallbackPrice: e.price,
        };
        byProduct.set(e.productId, agg);
        order.push(e.productId);
      }
      // Amounts are stored in the base unit. For WEIGHT/VOLUME normalise to the
      // large unit (per kg / per L = price per 1000 base units); for COUNT it's
      // the per-piece price.
      const baseAmount = e.variant?.weight;
      if (baseAmount && baseAmount > 0) {
        const unitPrice =
          agg.measurementType === MeasurementType.COUNT
            ? e.price / baseAmount
            : (e.price * 1000) / baseAmount;
        if (agg.minUnitPrice === null || unitPrice < agg.minUnitPrice) {
          agg.minUnitPrice = unitPrice;
        }
      }
    }
    const products = order.map((id) => byProduct.get(id)!);

    if (products.length === 0) {
      return this.sendOutOfStockMessage(phone);
    }

    const LIST_MAX = 10;
    const PAGE_SIZE = 9;
    let pageProducts: ProductRow[];
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
      description: this.buildProductSubtitle(p),
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
        footer: { text: 'Daily Fresh™' },
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
    if (!catalog) return this.sendUnavailableMessage(phone);

    const entries = (catalog.ShareCatalogProducts ?? []).filter(
      (e: any) =>
        e.productId === productId &&
        e.variantId &&
        e.variant &&
        this.isEntrySellable(catalog, e),
    );

    if (entries.length === 0) {
      await this.sendText(phone, 'Sorry, that product is no longer available.');
      return this.sendProductList(phone);
    }

    const productName = entries[0].product?.name ?? 'Product';
    const measurementType =
      entries[0].product?.measurementType ?? MeasurementType.WEIGHT;
    const noun = this.optionNoun(measurementType); // weight / size / pack

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
        body: { text: `Choose a ${noun}.` },
        footer: { text: 'Fresh to home™' },
        action: {
          button: `Select ${this.capitalize(noun)}`,
          sections: [
            { title: `Available ${this.capitalize(noun)}s`, rows },
          ],
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

    // Cleaning is a product-level capability; every variant carries a charge.
    if (!entry.product.cleaning) {
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

    // Cutting is a product-level capability offered by all its variants.
    if (!entry.product.cutting) {
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

    // Only surface styles whose master record is still active.
    const styles = (entry.variant.cuttingStyles ?? []).filter(
      (s: any) =>
        !s.isDeleted &&
        s.cuttingStyle &&
        s.cuttingStyle.isActive &&
        !s.cuttingStyle.isDeleted,
    );

    if (styles.length === 0) {
      // Cutting enabled but no styles configured — skip cutting.
      return this.sendItemSummary(phone, variantId, clean, 'n', 'none');
    }

    const rows = styles.slice(0, 10).map((s: any) => ({
      id: `cutopt~${variantId}~${clean}~${s.cuttingStyleId}`,
      title: this.truncate(s.cuttingStyle.name, 24),
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
      // cuttingOption carries the cutting-style id; resolve its display name.
      const styleName = this.getCuttingStyleName(entry.variant, cuttingOption);
      const label = styleName ? `Cutting (${styleName})` : 'Cutting';
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
                id: `addToCart~${variantId}~${clean}~${cut}~${cuttingOption}`,
                title: 'Add to Cart',
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

  /** Adds the configured item to the customer's cart, then shows the cart summary. */
  async addItemToCart(
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

    // The reply payload carries the cutting-style id; resolve its display name
    // (snapshotted onto the cart/order) and price server-side. Charges are never
    // trusted from the interactive reply payload.
    const resolvedStyleId =
      cut === 'y' && cuttingOption && cuttingOption !== 'none'
        ? cuttingOption
        : null;
    const cuttingStyleName = this.getCuttingStyleName(
      entry.variant,
      resolvedStyleId,
    );

    const cart = await this.cartService.addItem(phone, {
      variantId,
      productId: entry.variant.productId,
      price: entry.price,
      cleaning: clean === 'y',
      cleaningCharge: clean === 'y' ? entry.variant.cleaningCharge ?? 0 : 0,
      cutting: cut === 'y',
      cuttingOption: cuttingStyleName,
      cuttingCharge:
        cut === 'y' ? this.getCuttingPrice(entry.variant, resolvedStyleId) : 0,
    });

    if (!cart) {
      return this.sendText(phone, 'Could not add the item to your cart. Please try again.');
    }

    return this.sendCartSummary(phone);
  }

  /** Returns the line total for a single cart item, charges included. */
  private cartLineTotal(item: any): number {
    return (
      (item.price + (item.cleaningCharge ?? 0) + (item.cuttingCharge ?? 0)) *
      item.quantity
    );
  }

  /** Builds a one-line label for a cart item, e.g. "Chicken — 1 kg (Cleaned, Curry) x2". */
  private cartItemLabel(item: any): string {
    const product = item.product?.name ?? 'Item';
    const weight = item.variant ? this.formatWeight(item.variant) : '';
    const addOns: string[] = [];
    if (item.cleaning) addOns.push('Cleaned');
    if (item.cutting) {
      addOns.push(item.cuttingOption ? `Cut: ${item.cuttingOption}` : 'Cut');
    }
    const addOnText = addOns.length ? ` (${addOns.join(', ')})` : '';
    const qtyText = item.quantity > 1 ? ` x${item.quantity}` : '';
    return `${product}${weight ? ` — ${weight}` : ''}${addOnText}${qtyText}`;
  }

  async sendCartSummary(phone: string) {
    const cart = await this.cartService.getCart(phone);
    const items = cart?.cartItems ?? [];

    if (items.length === 0) {
      await this.sendText(phone, 'Your cart is empty. Here are the products again.');
      return this.sendProductList(phone);
    }

    const lines = items.map(
      (item: any) => `• ${this.cartItemLabel(item)} — ₹${this.cartLineTotal(item)}`,
    );
    const totalQty = items.reduce((acc: number, i: any) => acc + i.quantity, 0);
    const grandTotal = items.reduce(
      (acc: number, i: any) => acc + this.cartLineTotal(i),
      0,
    );

    const body =
      `🛒 *Your Cart*\n\n` +
      lines.join('\n') +
      `\n\nTotal items: ${totalQty}` +
      `\n*Total: ₹${grandTotal}*`;

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
            { type: 'reply', reply: { id: 'cartAddMore', title: 'Add more' } },
            { type: 'reply', reply: { id: 'cartRemove', title: 'Remove item' } },
            { type: 'reply', reply: { id: 'cartBuyNow', title: 'Buy it now' } },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Cart summary sent:', response.data);
  }

  /** Shows a list of cart lines so the customer can pick one to remove. */
  async sendCartRemoveList(phone: string) {
    const cart = await this.cartService.getCart(phone);
    const items = cart?.cartItems ?? [];

    if (items.length === 0) {
      return this.sendCartSummary(phone); // routes back to product list when empty
    }

    const rows = items.slice(0, 10).map((item: any) => ({
      id: `cartDel~${item.id}`,
      title: this.truncate(this.cartItemLabel(item), 24),
      description: `₹${this.cartLineTotal(item)}`,
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Remove an item' },
        body: { text: 'Select an item to remove from your cart.' },
        footer: { text: 'Fresh to home™' },
        action: {
          button: 'Remove',
          sections: [{ title: 'Cart Items', rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Cart remove list sent:', response.data);
  }

  async handleRemoveCartItem(phone: string, cartItemId: string) {
    await this.cartService.removeItem(phone, cartItemId);
    await this.sendText(phone, 'Item removed from your cart.');
    return this.sendCartSummary(phone);
  }

  /** Converts the cart into a DRAFT order and enters the address → payment flow. */
  async checkoutCart(phone: string) {
    const cart = await this.cartService.getCart(phone);
    const items = cart?.cartItems ?? [];

    if (items.length === 0) {
      await this.sendText(phone, 'Your cart is empty. Here are the products again.');
      return this.sendProductList(phone);
    }

    // Map cart lines into the products[] shape orderService.createOrder consumes.
    const products = items.map((item: any) => ({
      product_retailer_id: item.variantId,
      quantity: `${item.quantity}`,
      item_price: item.price,
      cleaning: item.cleaning,
      cleaningCharge: item.cleaningCharge ?? 0,
      cutting: item.cutting,
      cuttingOption: item.cuttingOption,
      cuttingCharge: item.cuttingCharge ?? 0,
    }));

    // createOrder builds the DRAFT order and sends the address confirmation/flow.
    await this.createOrder(phone, products);
    await this.cartService.clearCart(cart.id);
  }

  /** Returns the price of a cutting style (by master id) on a variant, or 0. */
  private getCuttingPrice(variant: any, styleId: string | null): number {
    if (!styleId || styleId === 'none') return 0;
    const match = (variant?.cuttingStyles ?? []).find(
      (s: any) => !s.isDeleted && s.cuttingStyleId === styleId,
    );
    return match?.price ?? 0;
  }

  /** Returns the display name of a cutting style (by master id) on a variant. */
  private getCuttingStyleName(variant: any, styleId: string | null): string | null {
    if (!styleId || styleId === 'none') return null;
    const match = (variant?.cuttingStyles ?? []).find(
      (s: any) => !s.isDeleted && s.cuttingStyleId === styleId,
    );
    return match?.cuttingStyle?.name ?? null;
  }

  private async handleCancelItem(phone: string) {
    await this.sendText(phone, 'No problem — here are the products again.');
    return this.sendProductList(phone);
  }

  private async sendOffHoursMessage(phone: string) {
    const activeCatalogs = await this.shareCatalogRepository.find({
      where: {
        status: In([ShareCatalogStatus.ACTIVE, ShareCatalogStatus.LIVE]),
        isDeleted: false,
      },
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

  /** Customer-facing noun for a product's variant options, by family. */
  private optionNoun(type: MeasurementType): string {
    if (type === MeasurementType.VOLUME) return 'size';
    if (type === MeasurementType.COUNT) return 'pack';
    return 'weight';
  }

  private capitalize(text: string): string {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  private formatWeight(variant: any): string {
    // Amounts are stored in the base unit (g / ml / count). kg and L are 1000x
    // their base unit, so convert the stored number back for display (e.g.
    // 1500 -> 1.5 kg, 1000 -> 1 L); g / ml / count are shown as-is.
    const unit = String(variant.unit).trim().toLowerCase();
    if (unit === 'kg' || unit === 'l') {
      const value = parseFloat((variant.weight / 1000).toFixed(3));
      return `${value} ${unit === 'l' ? 'L' : 'kg'}`;
    }
    return `${variant.weight} ${variant.unit}`;
  }

  /**
   * Grey subtitle line for a product row: lowest per-unit price (per kg / per L
   * / per piece depending on the product's measurement family) plus which prep
   * options (cleaning/cutting) the product supports. Falls back to the raw
   * entry price when no variant amount is available, and shows a dash when the
   * product supports neither prep option.
   */
  private buildProductSubtitle(p: {
    cleaning: boolean;
    cutting: boolean;
    measurementType: MeasurementType;
    minUnitPrice: number | null;
    fallbackPrice: number;
  }): string {
    const unitSuffix =
      p.measurementType === MeasurementType.VOLUME
        ? '/L'
        : p.measurementType === MeasurementType.COUNT
          ? '/piece'
          : '/kg';
    const price =
      p.minUnitPrice !== null
        ? `₹${Math.round(p.minUnitPrice)}${unitSuffix}`
        : `₹${p.fallbackPrice}`;

    const options: string[] = [];
    if (p.cleaning) options.push('🧼 Cleaning');
    if (p.cutting) options.push('🔪 Cutting');
    const optionsPart = options.length ? options.join(' · ') : '—';

    return this.truncate(`${price} · ${optionsPart}`, 72);
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
        await this.sendWardList(phone, 0, order.id);
      }
    } catch (error) {
      console.error('Error creating order:', error);
    }
  }

  /**
   * Prompts the customer to pick a ward if they don't have a saved address yet.
   * Used right after the welcome message to onboard the delivery address.
   */
  private async promptWardIfNoAddress(userId: string, phone: string) {
    const existingAddress = await this.userAddressRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!existingAddress) {
      await this.sendWardList(phone);
    }
  }

  /**
   * Sends an interactive list of active wards. The picked ward is carried into
   * the address Flow form via the reply id (`pickWard~<wardId>[~<orderId>]`).
   * `orderId` is present only in the checkout path; onboarding omits it.
   */
  async sendWardList(phone: string, page = 0, orderId?: string) {
    const wards = await this.wardService.findAllActive();

    // No wards configured yet — fall straight through to the address form so the
    // customer is never blocked.
    if (wards.length === 0) {
      return this.sendAddressFlowForm(phone, null, orderId);
    }

    const LIST_MAX = 10;
    const PAGE_SIZE = 9;
    let pageWards: typeof wards;
    let moreRow = false;

    if (wards.length <= LIST_MAX) {
      pageWards = wards;
    } else {
      const start = page * PAGE_SIZE;
      pageWards = wards.slice(start, start + PAGE_SIZE);
      if (pageWards.length === 0) {
        return this.sendWardList(phone, 0, orderId); // out-of-range page, restart
      }
      moreRow = start + PAGE_SIZE < wards.length;
    }

    const suffix = orderId ? `~${orderId}` : '';
    const rows: any[] = pageWards.map((w) => ({
      id: `pickWard~${w.id}${suffix}`,
      title: this.truncate(
        w.wardName ? `${w.wardName} (${w.wardNumber})` : `Ward ${w.wardNumber}`,
        24,
      ),
      description: this.truncate(`${w.localBodyName}, ${w.districtName}`, 72),
    }));
    if (moreRow) {
      rows.push({ id: `wardPage~${page + 1}${suffix}`, title: 'More wards' });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Select your ward' },
        body: { text: 'Choose the ward your delivery address falls under.' },
        footer: { text: 'Fresh to home™' },
        action: {
          button: 'Select Ward',
          sections: [{ title: 'Active Wards', rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Ward list sent:', response.data);
  }

  /**
   * Builds the address Flow `flow_token`, carrying the picked ward (and the
   * order id at checkout) so both can be recovered in `receiveAddress`.
   * Onboarding: `WARD:<wardId>` · Checkout: `<orderId>|WARD:<wardId>`.
   */
  private buildAddressFlowToken(wardId: string | null, orderId?: string): string {
    const parts: string[] = [];
    if (orderId) parts.push(orderId);
    parts.push(`WARD:${wardId ?? ''}`);
    return parts.join('|');
  }

  private parseAddressFlowToken(token: string): {
    wardId: string | null;
    orderId: string | null;
  } {
    if (!token) return { wardId: null, orderId: null };
    if (token.includes('|')) {
      const [first, second = ''] = token.split('|');
      const wardId = second.startsWith('WARD:') ? second.slice(5) || null : null;
      return { wardId, orderId: first || null };
    }
    if (token.startsWith('WARD:')) {
      return { wardId: token.slice(5) || null, orderId: null };
    }
    // Legacy token = plain orderId (no ward).
    return { wardId: null, orderId: token };
  }

  private async sendAddressFlowForm(
    phone: string,
    wardId: string | null,
    orderId?: string,
  ) {
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
            flow_token: this.buildAddressFlowToken(wardId, orderId),
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
        return this.sendAddressFlowForm(phone, null, orderId);
      }

      const order = await this.orderService.confirmOrderWithAddress(orderId, {
        name: address.name,
        address: address.address,
        pinCode: address.pinCode,
        phone: address.phone,
        wardId: address.wardId,
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
      const { wardId, orderId } = this.parseAddressFlowToken(
        addressData.flow_token,
      );

      const user = await this.userRepository.findOne({ where: { phone } });
      if (user) {
        await this.userAddressRepository.save(
          this.userAddressRepository.create({
            userId: user.id,
            name: addressData.name,
            address: addressData.address,
            pinCode: addressData.pincode,
            phone: addressData.phone,
            wardId: wardId ?? null,
          }),
        );
      }

      // Only the checkout path carries an order id — advance it to payment.
      // Onboarding (no order) just saves the address and stops here.
      if (orderId) {
        addressData.flow_token = orderId;
        // Preserve the ward parsed from the flow token so the order can record
        // it (the token is about to be overwritten with the bare order id).
        addressData.wardId = wardId ?? null;
        const order = await this.orderService.updateOrderAddress(addressData);
        if (order) {
          await this.sendPaymentMethodButtons(phone, order.id, order.totalAmount);
        }
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
        const unitLabel = item.variant ? this.formatWeight(item.variant) : '';
        const qtyText = unitLabel
          ? `${item.quantity} × ${unitLabel}`
          : `${item.quantity}`;
        return `• ${item.product?.name ?? 'Product'} - ${qtyText}${addOnText} - ₹${item.totalPrice}`;
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

  /**
   * Notifies the customer when an admin moves their order to a customer-facing
   * milestone (CONFIRMED or DISPATCHED). DISPATCHED is surfaced as
   * "out for delivery" in the copy.
   */
  async sendOrderStatusUpdateMessage(phone: string, order: any) {
    if (!order) return;

    const shortId = String(order.id ?? '').slice(0, 8).toUpperCase();

    let headline: string;
    // For a dispatched order, include the assigned delivery agent's contact so
    // the customer knows who is bringing their order.
    let agentLine = '';
    if (order.status === 'CONFIRMED') {
      headline = '✅ *Your order has been confirmed!*';
    } else if (order.status === 'DISPATCHED') {
      headline = '🚚 *Your order is out for delivery!*';
      if (order.deliveryAgent?.name) {
        agentLine =
          `\n*Delivery partner:* ${order.deliveryAgent.name}` +
          (order.deliveryAgent.phone
            ? `\n*Contact:* ${order.deliveryAgent.phone}`
            : '') +
          `\n`;
      }
    } else {
      // Not a customer-facing milestone; nothing to send.
      return;
    }

    const body =
      `${headline}\n\n` +
      `Order *#${shortId}*\n` +
      `*Total Amount: ₹${order.totalAmount}*\n` +
      agentLine +
      `\n_Further order updates will be notified to you on WhatsApp._`;

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
      const result = await this.orderService.selectPaymentMethod(
        orderId,
        PaymentMethod.COD,
      );
      if (result.outcome === 'locked') {
        return this.sendOrderLockedMessage(phone, result.order);
      }
      if (result.outcome !== 'updated' || !result.order) return;
      await this.sendCodConfirmationMessage(phone, result.order);
      // COD selection confirms the order — send the bill PDF (idempotent).
      await this.sendOrderBill(result.order.id);
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
      const result = await this.orderService.selectPaymentMethod(
        orderId,
        PaymentMethod.UPI,
      );
      if (result.outcome === 'locked') {
        return this.sendOrderLockedMessage(phone, result.order);
      }
      if (result.outcome !== 'updated' || !result.order) return;
      const order = result.order;

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

  /**
   * Sent when a customer taps a stale payment button on an order that is no
   * longer PENDING (already CONFIRMED, or CANCELLED/expired). The order is left
   * untouched; this just explains why the tap did nothing.
   */
  private async sendOrderLockedMessage(phone: string, order: any) {
    const body =
      order?.status === OrderStatus.CANCELLED
        ? `This order is no longer active and can't be changed.\n\n` +
          `Please place a new order to continue.`
        : `✅ Your order is already confirmed and can't be changed.\n\n` +
          `If you need any help, please contact support.`;

    await this.waInstance.post('/messages', {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    });
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

  /**
   * Generates the customer bill PDF and sends it to the customer as a WhatsApp
   * document. Idempotent: skips if a bill was already sent (billSentAt) or the
   * order has no customer phone. Safe to call from every confirm path — a
   * failure is logged and swallowed so it never breaks the confirm response.
   */
  async sendOrderBill(orderId: string) {
    try {
      const order = await this.orderService.findOne(orderId);
      if (!order || order.billSentAt) return;

      const phone = order.user?.phone ?? order.deliveryDetails?.phone;
      if (!phone) return;

      const orderNo = deriveOrderNumber(order);
      const filename = `bill-${orderNo}.pdf`;
      const pdf = await this.invoiceService.generateBill(order);
      const { url } = await this.uploadService.uploadFile({
        buffer: pdf,
        mimetype: 'application/pdf',
        originalname: filename,
      });

      await this.sendDocument(
        phone,
        url,
        filename,
        `🧾 Your D-Fresh bill for order ${orderNo}.`,
      );
      await this.orderService.markBillSent(orderId);
    } catch (error) {
      await this.sendLog(
        `sendOrderBill failed for ${orderId}: ${error?.message || error}`,
      );
    }
  }

  private async sendDocument(
    phone: string,
    url: string,
    filename: string,
    caption?: string,
  ) {
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'document',
      document: { link: url, filename, ...(caption ? { caption } : {}) },
    };
    const response = await this.waInstance.post('/messages', payload);
    console.log('Bill document sent:', response.data);
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
