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
  UserLanguage,
  UserTypes,
} from 'src/common/enums';
import { OrderService } from '../order/order.service';
import { InvoiceService } from '../order/invoice.service';
import { deriveOrderNumber } from '../order/order-number.util';
import { UploadService } from '../upload/upload.service';
import { CartService } from '../cart/cart.service';
import { WardService } from '../ward/ward.service';
import { AreaService } from '../area/area.service';
import { MessagesService } from 'src/common/messages/messages.service';
import { ShareCatalog } from '../share-catlaog/entities/share-catalog.entity';
import {
  IST_TZ,
  computeCurrentWindowStart,
  computeNextWindowStart,
} from '../share-catlaog/share-catlaog.window';
import { categoryIdOf, groupEntriesByCategory } from './catalog-grouping';
import { localize } from 'src/common/utils/localized-text';

/** Reply-id code (`setLang~<code>`) → language. Anything else is not a language. */
const LANGUAGE_BY_CODE: Record<string, UserLanguage> = {
  [UserLanguage.EN]: UserLanguage.EN,
  [UserLanguage.ML]: UserLanguage.ML,
};

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
    private areaService: AreaService,
    private invoiceService: InvoiceService,
    private messages: MessagesService,
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

    // When Meta rejects a message the customer simply sees nothing, and several
    // senders below have no catch of their own — the raw axios error then
    // reaches receiveMessage's console.error as an unreadable dump with the
    // reason buried. Surface Meta's own explanation, and the payload that
    // caused it, before letting the error carry on unchanged.
    this.waInstance.interceptors.response.use(undefined, (error) => {
      const meta = error?.response?.data?.error;
      if (meta) {
        console.error(
          `WhatsApp API rejected a message: ${meta.message}` +
            (meta.error_data?.details ? ` — ${meta.error_data.details}` : '') +
            ` (code ${meta.code}${meta.error_subcode ? `/${meta.error_subcode}` : ''})`,
        );
        console.error('Rejected payload:', error.config?.data);
      }
      return Promise.reject(error);
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
        // Language is settled before the name so the name prompt itself, and
        // everything after it, can be in the customer's own language.
        return this.sendLanguagePrompt(phone);
      }

      // Every language reply is answered here rather than in the interactive
      // dispatch, because during onboarding it arrives before the customer has
      // a name — and the name gate below answers any interactive reply from a
      // nameless customer with the name prompt, swallowing the buttons.
      const replyId = this.interactiveReplyId(message);
      if (replyId?.startsWith('setLang~')) {
        return this.handleLanguageSelection(phone, replyId.split('~')[1]);
      }

      // Only a customer still in onboarding is asked automatically. Anyone who
      // already has a name predates this feature: they read English and switch
      // from the main menu rather than being interrupted mid-conversation.
      if (!existingUser.language && !existingUser.name?.trim()) {
        return this.sendLanguagePrompt(phone);
      }

      // Everything below resolves its copy in the customer's language without
      // being handed it — see MessagesService.runWith.
      return this.messages.runWith(existingUser.language, () =>
        this.handleCustomerMessage(existingUser, message, type),
      );
    } catch (error) {
      console.error(error);
    }
  }

  /** The reply id of an interactive button/list tap, or null for anything else. */
  private interactiveReplyId(message: any): string | null {
    const interactive = message?.interactive;
    if (!interactive) return null;
    if (interactive.type === 'button_reply') {
      return interactive.button_reply?.id ?? null;
    }
    if (interactive.type === 'list_reply') {
      return interactive.list_reply?.id ?? null;
    }
    return null;
  }

  /**
   * Dispatch for a customer whose language is already settled. Always called
   * inside that language's scope.
   */
  private async handleCustomerMessage(user: User, message: any, type: string) {
    const phone = user.phone;

    if (!user.name || !user.name.trim()) {
      if (type === 'text') {
        const text = message.text?.body?.trim() || '';
        if (!text) {
          return this.sendNamePromptMessage(phone);
        }
        user.name = text.slice(0, 100);
        await this.userRepository.save(user);
        return this.promptWardIfNoAddress(user.id, phone);
      }
      return this.sendNamePromptMessage(phone, true);
    }

    if (type == 'order') {
      console.log('Order received', message.order);
      await this.createOrder(message.from, message.order.product_items);
    }

    if (type == 'text') {
      const body = message.text?.body?.trim() ?? '';
      console.log('Text received', message.text);
      // A greeting/first contact shows the welcome; any other free text shows
      // the main menu instead of bouncing the user back to onboarding.
      if (/^(hi|hello|hey|hai|start|menu)$/i.test(body)) {
        return this.sendWelcomeMessage(user.name, phone);
      }
      return this.sendMainMenu(user.name, phone);
    }

    if (type == 'interactive') {
      const replyId = this.interactiveReplyId(message);
      if (replyId) {
        return this.handleInteractiveReply(phone, replyId);
      }
      if (message.interactive?.type === 'nfm_reply') {
        return this.receiveAddress(
          phone,
          message.interactive.nfm_reply.response_json,
        );
      }
    }

    if (type == 'image') {
      const mediaId = message.image?.id;
      if (mediaId) {
        return this.handlePaymentScreenshot(phone, mediaId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Language
  // ---------------------------------------------------------------------------

  /**
   * Asks the customer which language they want to chat in — before the name
   * prompt for a new customer, and on demand from the main menu.
   *
   * The copy is read explicitly in English because this is the one message sent
   * before we know the answer. `language.prompt` and the two button titles are
   * kept identical in every bundle, so it reads the same whichever is used.
   */
  private async sendLanguagePrompt(phone: string) {
    try {
      const en = UserLanguage.EN;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: this.messages.get('language.prompt', {}, en) },
          footer: { text: this.messages.get('common.footer', {}, en) },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: `setLang~${UserLanguage.EN}`,
                  title: this.messages.get('language.buttonEnglish', {}, en),
                },
              },
              {
                type: 'reply',
                reply: {
                  id: `setLang~${UserLanguage.ML}`,
                  title: this.messages.get('language.buttonMalayalam', {}, en),
                },
              },
            ],
          },
        },
      };

      const response = await this.waInstance.post('/messages', payload);
      console.log('Language prompt sent:', response.data);
    } catch (error: any) {
      console.error(
        'Error sending language prompt:',
        error.response?.data || error.message,
      );
    }
  }

  /**
   * Stores the language a customer picked and puts them back where they were:
   * still onboarding → the name prompt; otherwise a confirmation and the main
   * menu. Both already in the newly chosen language.
   */
  private async handleLanguageSelection(phone: string, code: string) {
    const language = LANGUAGE_BY_CODE[code];
    // An unrecognised code means a stale button from an older build — ask again
    // rather than store something we cannot read back.
    if (!language) {
      return this.sendLanguagePrompt(phone);
    }

    const user = await this.userRepository.findOne({ where: { phone } });
    if (!user) return;

    user.language = language;
    await this.userRepository.save(user);

    return this.messages.runWith(language, async () => {
      if (!user.name?.trim()) {
        return this.sendNamePromptMessage(phone);
      }
      await this.sendText(phone, this.messages.get('language.changed'));
      return this.sendMainMenu(user.name, phone);
    });
  }

  /**
   * Runs `fn` in the language of the customer on `phone`. Needed by the send
   * paths triggered from the dashboard or a cron rather than by an inbound
   * message — those have no language scope of their own and would otherwise
   * fall back to English.
   */
  private async withCustomerLanguage<T>(
    phone: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const user = await this.userRepository.findOne({
      where: { phone },
      select: ['id', 'language'],
    });
    return this.messages.runWith(user?.language, fn);
  }

  /** Entry buttons shown with the welcome / main menu. */
  private async entryButtons(phone: string): Promise<any[]> {
    const cart = await this.cartService.getCart(phone);
    const buttons: any[] = [
      {
        type: 'reply',
        reply: {
          id: 'get-catlog',
          title: this.messages.get('onboarding.buttonViewProducts'),
        },
      },
    ];
    // Only offer "View Cart" when the customer actually has items in it.
    if ((cart?.cartItems?.length ?? 0) > 0) {
      buttons.push({
        type: 'reply',
        reply: {
          id: 'cartView',
          title: this.messages.get('onboarding.buttonViewCart'),
        },
      });
    }
    // Third and last — WhatsApp rejects a button message with more than three.
    buttons.push({
      type: 'reply',
      reply: {
        id: 'changeLang',
        title: this.messages.get('onboarding.buttonLanguage'),
      },
    });
    return buttons;
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
          body: { text: this.messages.get('onboarding.welcome', { name }) },
          footer: { text: this.messages.get('common.footer') },
          action: {
            buttons: await this.entryButtons(phone),
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
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: this.messages.get('onboarding.mainMenu', { name }) },
          footer: { text: this.messages.get('common.footer') },
          action: {
            buttons: await this.entryButtons(phone),
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
      const body = this.messages.get(
        isReprompt ? 'onboarding.nameReprompt' : 'onboarding.namePrompt',
      );

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
   *
   * `language` is passed in because the caller has already loaded every
   * customer; looking it up again here would cost one query per recipient.
   */
  async sendProduct(phone: string, language?: UserLanguage | null) {
    try {
      return await this.messages.runWith(language, async () => {
        const catalog = await this.getOpenCatalog();
        if (!catalog) {
          return this.sendUnavailableMessage(phone);
        }

        await this.sendText(phone, this.messages.get('catalog.broadcast'));

        return this.sendCategoryList(phone);
      });
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
      // `setLang~` is deliberately absent: receiveMessage intercepts it before
      // the name gate, for every customer, so it never reaches this switch.
      case 'changeLang':
        return this.sendLanguagePrompt(phone);
      case 'pickCat':
        return this.sendProductList(phone, parts[0]);
      case 'catPage':
        return this.sendCategoryList(phone, parseInt(parts[0], 10) || 0);
      case 'catList':
        return this.sendCategoryList(phone);
      case 'pickWeight':
        return this.sendWeightList(phone, parts[0]);
      case 'prodPage':
        // parts: [categoryId, page]
        return this.sendProductList(phone, parts[0], parseInt(parts[1], 10) || 0);
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
        return this.sendCategoryList(phone);
      case 'cartRemove':
        return this.sendCartRemoveList(phone);
      case 'cartDel':
        // parts: [cartItemId]
        return this.handleRemoveCartItem(phone, parts[0]);
      case 'cartBuyNow':
        return this.checkoutCart(phone);
      case 'pickWard':
        // parts: [wardId, orderId?]
        return this.sendAreaListOrForm(phone, parts[0], parts[1]);
      case 'wardPage':
        // parts: [page, orderId?]
        return this.sendWardList(phone, parseInt(parts[0], 10) || 0, parts[1]);
      case 'pickArea':
        // parts: [areaId, wardId, orderId?]
        return this.sendAddressFlowForm(phone, parts[1], parts[2], parts[0]);
      case 'areaPage':
        // parts: [page, wardId, orderId?]
        return this.sendAreaList(
          phone,
          parts[1],
          parseInt(parts[0], 10) || 0,
          parts[2],
        );
    }

    // Legacy hyphen-prefixed actions (catalog entry / address / payment)
    if (replyId === 'get-catlog') {
      return this.sendCategoryList(phone);
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
          product: { category: true },
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
    return this.sendText(phone, this.messages.get('availability.outOfStock'));
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

  /** Sellable entries of the open catalog — the shared basis of both lists. */
  private sellableEntries(catalog: any): any[] {
    return (catalog.ShareCatalogProducts ?? []).filter(
      (e: any) =>
        e.variantId &&
        e.variant &&
        e.product &&
        this.isEntrySellable(catalog, e),
    );
  }

  /**
   * First step of product browsing: the categories present in the open catalog
   * that still have stock. Picking one leads to `sendProductList`.
   *
   * `allowAutoSkip` jumps straight to the products when only one category has
   * stock (no point making the customer tap a one-row list). It is passed as
   * false when we arrive here *from* `sendProductList` after a category sold
   * out, which is what stops the two screens ping-ponging.
   */
  async sendCategoryList(phone: string, page = 0, allowAutoSkip = true) {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return this.sendUnavailableMessage(phone);

    const categories = groupEntriesByCategory(
      this.sellableEntries(catalog),
      this.messages.currentLanguage(),
    );

    if (categories.length === 0) {
      return this.sendOutOfStockMessage(phone);
    }

    if (categories.length === 1 && allowAutoSkip) {
      // Single category — skip the step, and drop the back row it would offer.
      return this.sendProductList(phone, categories[0].id, 0, false);
    }

    const LIST_MAX = 10;
    const PAGE_SIZE = 9;
    let pageCategories: typeof categories;
    let moreRow = false;

    if (categories.length <= LIST_MAX) {
      pageCategories = categories;
    } else {
      const start = page * PAGE_SIZE;
      pageCategories = categories.slice(start, start + PAGE_SIZE);
      if (pageCategories.length === 0) {
        return this.sendCategoryList(phone, 0, false); // out-of-range page, restart
      }
      moreRow = start + PAGE_SIZE < categories.length;
    }

    const rows: any[] = pageCategories.map((c) => ({
      id: `pickCat~${c.id}`,
      title: this.truncate(c.name, 24),
      description: this.messages.get(
        c.productCount === 1 ? 'category.rowCountOne' : 'category.rowCount',
        { count: c.productCount },
      ),
    }));
    if (moreRow) {
      rows.push({
        id: `catPage~${page + 1}`,
        title: this.messages.get('category.listMore'),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.messages.get('category.listHeader') },
        body: { text: this.messages.get('category.listBody') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get('category.listButton'),
          sections: [{ title: this.messages.get('category.listSection'), rows }],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Category list sent:', response.data);
  }

  /**
   * Second step of product browsing: the in-stock products of one category.
   * `showBack` is false only when we auto-skipped the category step, since a
   * back row would lead to a pointless one-row list.
   */
  async sendProductList(
    phone: string,
    categoryId: string,
    page = 0,
    showBack = true,
  ) {
    const catalog = await this.getOpenCatalog();
    if (!catalog) return this.sendUnavailableMessage(phone);

    const entries = this.sellableEntries(catalog).filter(
      (e: any) => categoryIdOf(e) === categoryId,
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
          name: localize(e.product.name, this.messages.currentLanguage()),
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
      // The category emptied out between the customer seeing it and tapping it
      // (or the reply carried a stale category id). Say so, then re-offer the
      // refreshed list — without auto-skipping, so we can't bounce back here.
      await this.sendText(phone, this.messages.get('category.soldOut'));
      return this.sendCategoryList(phone, 0, false);
    }

    const categoryName =
      (entries[0].product?.category?.name &&
        localize(entries[0].product.category.name, this.messages.currentLanguage())) ||
      this.messages.get('catalog.listSectionFallback');

    // WhatsApp caps a list at 10 rows, and the back row costs one of them.
    const backRows = showBack ? 1 : 0;
    const LIST_MAX = 10 - backRows;
    const PAGE_SIZE = LIST_MAX - 1; // one slot reserved for "More products"
    let pageProducts: ProductRow[];
    let moreRow = false;

    if (products.length <= LIST_MAX) {
      pageProducts = products;
    } else {
      const start = page * PAGE_SIZE;
      pageProducts = products.slice(start, start + PAGE_SIZE);
      if (pageProducts.length === 0) {
        // out-of-range page, restart
        return this.sendProductList(phone, categoryId, 0, showBack);
      }
      moreRow = start + PAGE_SIZE < products.length;
    }

    const rows: any[] = pageProducts.map((p) => ({
      id: `pickWeight~${p.id}`,
      title: this.truncate(p.name, 24),
      description: this.buildProductSubtitle(p),
    }));
    if (moreRow) {
      rows.push({
        id: `prodPage~${categoryId}~${page + 1}`,
        title: this.messages.get('catalog.listMore'),
      });
    }
    if (showBack) {
      rows.push({ id: 'catList', title: this.messages.get('category.backRow') });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.messages.get('catalog.listHeader') },
        body: { text: this.messages.get('catalog.listBody') },
        footer: { text: this.messages.get('common.productListFooter') },
        action: {
          button: this.messages.get('catalog.listButton'),
          sections: [{ title: this.truncate(categoryName, 24), rows }],
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
      await this.sendText(phone, this.messages.get('variant.unavailable'));
      return this.sendCategoryList(phone);
    }

    const productName =
      (entries[0].product?.name &&
        localize(entries[0].product.name, this.messages.currentLanguage())) ||
      this.messages.get('common.fallbackProduct');
    // The wording of the list depends on the measurement family: a weight, a
    // size or a pack. Each family has its own authored phrases.
    const family = this.measurementSuffix(
      entries[0].product?.measurementType ?? MeasurementType.WEIGHT,
    );

    const rows = entries.slice(0, 10).map((e: any) => ({
      id: `pickVariant~${e.variantId}`,
      title: this.truncate(this.formatWeight(e.variant), 24),
      description: this.messages.get('variant.rowPrice', { price: e.price }),
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: this.truncate(productName, 60) },
        body: { text: this.messages.get(`variant.listBody${family}`) },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get(`variant.listButton${family}`),
          sections: [
            { title: this.messages.get(`variant.listSection${family}`), rows },
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
      await this.sendText(phone, this.messages.get('prep.unavailable'));
      return this.sendCategoryList(phone);
    }

    // Cleaning is a product-level capability; every variant carries a charge.
    if (!entry.product.cleaning) {
      return this.askCutting(phone, variantId, 'n');
    }

    const charge = entry.variant.cleaningCharge ?? 0;
    const chargeSuffix =
      charge > 0 ? this.messages.get('prep.cleaningChargeSuffix', { charge }) : '';

    return this.sendYesNoButtons(
      phone,
      this.messages.get('prep.cleaningQuestion', { chargeSuffix }),
      `clean~${variantId}~y`,
      `clean~${variantId}~n`,
    );
  }

  async askCutting(phone: string, variantId: string, clean: string) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, this.messages.get('prep.unavailable'));
      return this.sendCategoryList(phone);
    }

    // Cutting is a product-level capability offered by all its variants.
    if (!entry.product.cutting) {
      return this.sendItemSummary(phone, variantId, clean, 'n', 'none');
    }

    return this.sendYesNoButtons(
      phone,
      this.messages.get('prep.cuttingQuestion'),
      `cut~${variantId}~${clean}~y`,
      `cut~${variantId}~${clean}~n`,
    );
  }

  async askCuttingOption(phone: string, variantId: string, clean: string) {
    const entry = await this.findCatalogEntry(variantId);
    if (!entry) {
      await this.sendText(phone, this.messages.get('prep.unavailable'));
      return this.sendCategoryList(phone);
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
      title: this.truncate(localize(s.cuttingStyle.name, this.messages.currentLanguage()), 24),
      description:
        s.price > 0
          ? this.messages.get('prep.cuttingRowPrice', { price: s.price })
          : this.messages.get('prep.cuttingRowFree'),
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: this.messages.get('prep.cuttingListBody') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get('prep.cuttingListButton'),
          sections: [
            { title: this.messages.get('prep.cuttingListSection'), rows },
          ],
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
      await this.sendText(phone, this.messages.get('prep.unavailable'));
      return this.sendCategoryList(phone);
    }

    const productName =
      (entry.product?.name && localize(entry.product.name, this.messages.currentLanguage())) ||
      this.messages.get('common.fallbackProduct');
    const weight = this.formatWeight(entry.variant);
    const price = entry.price;

    const cleaningCharge =
      clean === 'y' ? entry.variant.cleaningCharge ?? 0 : 0;
    const cuttingCharge =
      cut === 'y' ? this.getCuttingPrice(entry.variant, cuttingOption) : 0;
    const total = price + cleaningCharge + cuttingCharge;

    const lines = [
      this.messages.get('item.lineProduct', { product: productName, weight }),
      this.messages.get('item.lineBasePrice', { price }),
    ];
    if (clean === 'y') {
      lines.push(this.messages.get('item.lineCleaning', { charge: cleaningCharge }));
    }
    if (cut === 'y') {
      // cuttingOption carries the cutting-style id; resolve its display name.
      const style = this.getCuttingStyleName(entry.variant, cuttingOption);
      lines.push(
        style
          ? this.messages.get('item.lineCuttingWithStyle', {
              style,
              charge: cuttingCharge,
            })
          : this.messages.get('item.lineCutting', { charge: cuttingCharge }),
      );
    }

    const body = this.messages.get('item.summary', {
      lines: lines.join('\n'),
      total,
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        footer: { text: this.messages.get('common.footer') },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `addToCart~${variantId}~${clean}~${cut}~${cuttingOption}`,
                title: this.messages.get('item.buttonAddToCart'),
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'cancelItem',
                title: this.messages.get('item.buttonCancel'),
              },
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
      await this.sendText(phone, this.messages.get('prep.unavailable'));
      return this.sendCategoryList(phone);
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
      return this.sendText(phone, this.messages.get('cart.addFailed'));
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
    const weight = item.variant ? this.formatWeight(item.variant) : '';
    const addOns: string[] = [];
    if (item.cleaning) addOns.push(this.messages.get('cart.addOnCleaned'));
    if (item.cutting) {
      addOns.push(
        item.cuttingOption
          ? this.messages.get('cart.addOnCutWithStyle', {
              style: item.cuttingOption,
            })
          : this.messages.get('cart.addOnCut'),
      );
    }

    return this.messages.get('cart.label', {
      product:
        (item.product?.name && localize(item.product.name, this.messages.currentLanguage())) ||
        this.messages.get('common.fallbackItem'),
      weightPart: weight
        ? this.messages.get('cart.labelWeightPart', { weight })
        : '',
      addOnPart: addOns.length
        ? this.messages.get('cart.labelAddOnPart', {
            addOns: addOns.join(this.messages.get('cart.labelAddOnSeparator')),
          })
        : '',
      quantityPart:
        item.quantity > 1
          ? this.messages.get('cart.labelQuantityPart', {
              quantity: item.quantity,
            })
          : '',
    });
  }

  async sendCartSummary(phone: string) {
    const cart = await this.cartService.getCart(phone);
    const items = cart?.cartItems ?? [];

    if (items.length === 0) {
      await this.sendText(phone, this.messages.get('cart.empty'));
      return this.sendCategoryList(phone);
    }

    const lines = items.map((item: any) =>
      this.messages.get('cart.line', {
        label: this.cartItemLabel(item),
        lineTotal: this.cartLineTotal(item),
      }),
    );
    const totalQty = items.reduce((acc: number, i: any) => acc + i.quantity, 0);
    const grandTotal = items.reduce(
      (acc: number, i: any) => acc + this.cartLineTotal(i),
      0,
    );

    const body = this.messages.get('cart.summary', {
      lines: lines.join('\n'),
      totalQuantity: totalQty,
      grandTotal,
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        footer: { text: this.messages.get('common.footer') },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'cartAddMore',
                title: this.messages.get('cart.buttonAddMore'),
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'cartRemove',
                title: this.messages.get('cart.buttonRemove'),
              },
            },
            {
              type: 'reply',
              reply: {
                id: 'cartBuyNow',
                title: this.messages.get('cart.buttonBuyNow'),
              },
            },
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
      description: this.messages.get('cart.removeRowPrice', {
        lineTotal: this.cartLineTotal(item),
      }),
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: this.messages.get('cart.removeListHeader'),
        },
        body: { text: this.messages.get('cart.removeListBody') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get('cart.removeListButton'),
          sections: [
            { title: this.messages.get('cart.removeListSection'), rows },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Cart remove list sent:', response.data);
  }

  async handleRemoveCartItem(phone: string, cartItemId: string) {
    await this.cartService.removeItem(phone, cartItemId);
    await this.sendText(phone, this.messages.get('cart.itemRemoved'));
    return this.sendCartSummary(phone);
  }

  /** Converts the cart into a DRAFT order and enters the address → payment flow. */
  async checkoutCart(phone: string) {
    const cart = await this.cartService.getCart(phone);
    const items = cart?.cartItems ?? [];

    if (items.length === 0) {
      await this.sendText(phone, this.messages.get('cart.empty'));
      return this.sendCategoryList(phone);
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
    return match?.cuttingStyle?.name
      ? localize(match.cuttingStyle.name, this.messages.currentLanguage())
      : null;
  }

  private async handleCancelItem(phone: string) {
    await this.sendText(phone, this.messages.get('item.cancelled'));
    return this.sendCategoryList(phone);
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
      ? this.messages.get('availability.offHoursWithNext', {
          nextWindow: formatInTimeZone(
            nextStart,
            IST_TZ,
            "EEE, d MMM 'at' h:mm a",
          ),
        })
      : this.messages.get('availability.offHours');

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
        footer: { text: this.messages.get('common.footer') },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: yesId, title: this.messages.get('common.buttonYes') },
            },
            {
              type: 'reply',
              reply: { id: noId, title: this.messages.get('common.buttonNo') },
            },
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

  /**
   * Message-key suffix for a measurement family, e.g. `variant.listBodyWeight`.
   * Each family gets its own authored phrase rather than a noun spliced into a
   * sentence, which does not survive translation.
   */
  private measurementSuffix(type: MeasurementType): string {
    if (type === MeasurementType.VOLUME) return 'Volume';
    if (type === MeasurementType.COUNT) return 'Count';
    return 'Weight';
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
    const unitSuffix = this.messages.get(
      `catalog.unitSuffix${this.measurementSuffix(p.measurementType)}`,
    );
    const price =
      p.minUnitPrice !== null
        ? this.messages.get('catalog.subtitlePriceUnit', {
            price: Math.round(p.minUnitPrice),
            unitSuffix,
          })
        : this.messages.get('catalog.subtitlePriceFlat', {
            price: p.fallbackPrice,
          });

    const options: string[] = [];
    if (p.cleaning) options.push(this.messages.get('catalog.optionCleaning'));
    if (p.cutting) options.push(this.messages.get('catalog.optionCutting'));
    const separator = this.messages.get('common.separator');
    const optionsPart = options.length
      ? options.join(separator)
      : this.messages.get('common.none');

    return this.truncate(
      this.messages.get('catalog.subtitle', { price, separator, options: optionsPart }),
      72,
    );
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
    const lang = this.messages.currentLanguage();
    const rows: any[] = pageWards.map((w) => {
      const wardName = localize(w.wardName, lang);
      return {
        id: `pickWard~${w.id}${suffix}`,
        title: this.truncate(
          wardName
            ? this.messages.get('address.wardRowNamed', {
                wardName,
                wardNumber: w.wardNumber,
              })
            : this.messages.get('address.wardRowUnnamed', {
                wardNumber: w.wardNumber,
              }),
          24,
        ),
        description: this.truncate(
          this.messages.get('address.wardRowDescription', {
            localBodyName: localize(w.localBodyName, lang),
            districtName: localize(w.districtName, lang),
          }),
          72,
        ),
      };
    });
    if (moreRow) {
      rows.push({
        id: `wardPage~${page + 1}${suffix}`,
        title: this.messages.get('address.wardListMore'),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: this.messages.get('address.wardListHeader'),
        },
        body: { text: this.messages.get('address.wardListBody') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get('address.wardListButton'),
          sections: [
            { title: this.messages.get('address.wardListSection'), rows },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Ward list sent:', response.data);
  }

  /**
   * Builds the address Flow `flow_token`, carrying the picked ward, the
   * picked area (when the ward had any), and the order id at checkout, so
   * all three can be recovered in `receiveAddress`. Segments are order-id
   * (checkout only) · `WARD:<wardId>` · `AREA:<areaId>` (only when an area
   * was picked), joined with `|`. Onboarding, no area: `WARD:<wardId>`.
   */
  private buildAddressFlowToken(
    wardId: string | null,
    orderId?: string,
    areaId?: string | null,
  ): string {
    const parts: string[] = [];
    if (orderId) parts.push(orderId);
    parts.push(`WARD:${wardId ?? ''}`);
    if (areaId) parts.push(`AREA:${areaId}`);
    return parts.join('|');
  }

  private parseAddressFlowToken(token: string): {
    wardId: string | null;
    orderId: string | null;
    areaId: string | null;
  } {
    if (!token) return { wardId: null, orderId: null, areaId: null };

    const segments = token.split('|');

    // Legacy token = plain orderId (no ward/area segments at all).
    if (segments.length === 1 && !segments[0].startsWith('WARD:')) {
      return { wardId: null, orderId: segments[0] || null, areaId: null };
    }

    let orderId: string | null = null;
    let wardId: string | null = null;
    let areaId: string | null = null;
    for (const segment of segments) {
      if (segment.startsWith('WARD:')) {
        wardId = segment.slice(5) || null;
      } else if (segment.startsWith('AREA:')) {
        areaId = segment.slice(5) || null;
      } else if (segment) {
        orderId = segment;
      }
    }
    return { wardId, orderId, areaId };
  }

  private async sendAddressFlowForm(
    phone: string,
    wardId: string | null,
    orderId?: string,
    areaId?: string | null,
  ) {
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: this.messages.get('address.flowPrompt') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: '902959149367544',
            flow_cta: this.messages.get('address.flowButton'),
            flow_token: this.buildAddressFlowToken(wardId, orderId, areaId),
          },
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Address form sent:', response.data);
  }

  /**
   * After a ward is picked, shows an Area list scoped to that ward if any are
   * configured; otherwise falls straight through to the address form
   * unchanged (areas roll out ward-by-ward, never blocking checkout).
   */
  private async sendAreaListOrForm(
    phone: string,
    wardId: string,
    orderId?: string,
  ) {
    const areas = await this.areaService.findActiveByWard(wardId);
    if (areas.length === 0) {
      return this.sendAddressFlowForm(phone, wardId, orderId);
    }
    return this.sendAreaList(phone, wardId, 0, orderId);
  }

  /**
   * Sends an interactive list of active areas for a ward. The picked area is
   * carried into the address Flow form via the reply id
   * (`pickArea~<areaId>~<wardId>[~<orderId>]`), mirroring `sendWardList`.
   */
  async sendAreaList(phone: string, wardId: string, page = 0, orderId?: string) {
    const areas = await this.areaService.findActiveByWard(wardId);

    if (areas.length === 0) {
      return this.sendAddressFlowForm(phone, wardId, orderId);
    }

    const LIST_MAX = 10;
    const PAGE_SIZE = 9;
    let pageAreas: typeof areas;
    let moreRow = false;

    if (areas.length <= LIST_MAX) {
      pageAreas = areas;
    } else {
      const start = page * PAGE_SIZE;
      pageAreas = areas.slice(start, start + PAGE_SIZE);
      if (pageAreas.length === 0) {
        return this.sendAreaList(phone, wardId, 0, orderId); // out-of-range page, restart
      }
      moreRow = start + PAGE_SIZE < areas.length;
    }

    const suffix = orderId ? `~${orderId}` : '';
    const rows: any[] = pageAreas.map((a) => ({
      id: `pickArea~${a.id}~${wardId}${suffix}`,
      title: this.truncate(localize(a.name, this.messages.currentLanguage()), 24),
    }));
    if (moreRow) {
      rows.push({
        id: `areaPage~${page + 1}~${wardId}${suffix}`,
        title: this.messages.get('address.areaListMore'),
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: {
          type: 'text',
          text: this.messages.get('address.areaListHeader'),
        },
        body: { text: this.messages.get('address.areaListBody') },
        footer: { text: this.messages.get('common.footer') },
        action: {
          button: this.messages.get('address.areaListButton'),
          sections: [
            { title: this.messages.get('address.areaListSection'), rows },
          ],
        },
      },
    };

    const response = await this.waInstance.post('/messages', payload);
    console.log('Area list sent:', response.data);
  }

  private async sendAddressConfirmationButtons(
    phone: string,
    orderId: string,
    address: UserAddress,
  ) {
    const addressText = this.messages.get('address.confirm', {
      name: address.name,
      address: address.address,
      pinCode: address.pinCode,
      phone: address.phone,
    });

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: addressText },
        footer: { text: this.messages.get('common.footer') },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `confirmAddress-${orderId}`,
                title: this.messages.get('address.buttonConfirm'),
              },
            },
            {
              type: 'reply',
              reply: {
                id: `addAddress-${orderId}`,
                title: this.messages.get('address.buttonAddNew'),
              },
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
        areaId: address.areaId,
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
      const { wardId, orderId, areaId } = this.parseAddressFlowToken(
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
            areaId: areaId ?? null,
          }),
        );
      }

      // Only the checkout path carries an order id — advance it to payment.
      // Onboarding (no order) just saves the address and stops here.
      if (orderId) {
        addressData.flow_token = orderId;
        // Preserve the ward/area parsed from the flow token so the order can
        // record them (the token is about to be overwritten with the bare
        // order id).
        addressData.wardId = wardId ?? null;
        addressData.areaId = areaId ?? null;
        const order = await this.orderService.updateOrderAddress(addressData);
        if (order) {
          await this.sendPaymentMethodButtons(phone, order.id, order.totalAmount);
        }
      }
    } catch (error) {
      console.error('Error receiving address:', error);
    }
  }

  /** One "• Chicken - 2 × 1 kg (Cleaning +₹40) - ₹560" line of an order. */
  private orderItemLine(item: any): string {
    const addOns: string[] = [];
    if (item.cleaning) {
      addOns.push(
        this.messages.get('order.addOnCleaning', {
          charge: item.cleaningCharge ?? 0,
        }),
      );
    }
    if (item.cutting) {
      addOns.push(
        item.cuttingOption
          ? this.messages.get('order.addOnCuttingWithStyle', {
              style: item.cuttingOption,
              charge: item.cuttingCharge ?? 0,
            })
          : this.messages.get('order.addOnCutting', {
              charge: item.cuttingCharge ?? 0,
            }),
      );
    }

    const unit = item.variant ? this.formatWeight(item.variant) : '';
    return this.messages.get('order.line', {
      product:
        (item.product?.name && localize(item.product.name, this.messages.currentLanguage())) ||
        this.messages.get('common.fallbackProduct'),
      quantity: unit
        ? this.messages.get('order.lineQuantityWithUnit', {
            quantity: item.quantity,
            unit,
          })
        : this.messages.get('order.lineQuantity', { quantity: item.quantity }),
      addOnPart: addOns.length
        ? this.messages.get('order.lineAddOnPart', {
            addOns: addOns.join(this.messages.get('order.lineAddOnSeparator')),
          })
        : '',
      lineTotal: item.totalPrice,
    });
  }

  /** The delivery address block shared by the order and COD confirmations. */
  private orderAddressBlock(deliveryDetails: any): string {
    if (!deliveryDetails) return this.messages.get('order.addressMissing');
    return this.messages.get('order.addressBlock', {
      name: deliveryDetails.name,
      address: deliveryDetails.address,
      pinCode: deliveryDetails.pinCode,
      phone: deliveryDetails.phone,
    });
  }

  async sendOrderConfirmationMessage(phone: string, order: any) {
    if (!order) return;

    // Triggered from the dashboard, so it opens its own language scope.
    await this.withCustomerLanguage(phone, async () => {
      const itemLines = order.orderItems
        .map((item: any) => this.orderItemLine(item))
        .join('\n');

      const body = this.messages.get('order.placed', {
        lines: itemLines,
        totalAmount: order.totalAmount,
        address: this.orderAddressBlock(order.deliveryDetails),
      });

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body },
      };

      await this.waInstance.post('/messages', payload);
    });
  }

  /**
   * Notifies the customer when an admin moves their order to a customer-facing
   * milestone (CONFIRMED or DISPATCHED). DISPATCHED is surfaced as
   * "out for delivery" in the copy.
   */
  async sendOrderStatusUpdateMessage(phone: string, order: any) {
    if (!order) return;

    // Triggered from the dashboard, so it opens its own language scope.
    await this.withCustomerLanguage(phone, async () => {
      const shortId = String(order.id ?? '').slice(0, 8).toUpperCase();

      let headline: string;
      // For a dispatched order, include the assigned delivery agent's contact so
      // the customer knows who is bringing their order.
      let agentBlock = '';
      if (order.status === 'CONFIRMED') {
        headline = this.messages.get('order.statusConfirmedHeadline');
      } else if (order.status === 'DISPATCHED') {
        headline = this.messages.get('order.statusDispatchedHeadline');
        if (order.deliveryAgent?.name) {
          agentBlock = this.messages.get('order.agentBlock', {
            agentName: order.deliveryAgent.name,
            agentContact: order.deliveryAgent.phone
              ? this.messages.get('order.agentContact', {
                  agentPhone: order.deliveryAgent.phone,
                })
              : '',
          });
        }
      } else {
        // Not a customer-facing milestone; nothing to send.
        return;
      }

      const body = this.messages.get('order.statusUpdate', {
        headline,
        orderNumber: shortId,
        totalAmount: order.totalAmount,
        agentBlock,
      });

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body },
      };

      await this.waInstance.post('/messages', payload);
    });
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
          text: this.messages.get('payment.prompt', {
            amount: Number(amount).toFixed(2),
          }),
        },
        footer: { text: this.messages.get('common.footer') },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `selectPaymentCOD-${orderId}`,
                title: this.messages.get('payment.buttonCod'),
              },
            },
            {
              type: 'reply',
              reply: {
                id: `selectPaymentUPI-${orderId}`,
                title: this.messages.get('payment.buttonUpi'),
              },
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
    const body = this.messages.get('payment.codConfirmed', {
      amount: Number(order.totalAmount).toFixed(2),
      address: this.orderAddressBlock(order.deliveryDetails),
    });

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
    const body = this.messages.get(
      order?.status === OrderStatus.CANCELLED
        ? 'payment.lockedCancelled'
        : 'payment.lockedConfirmed',
    );

    await this.waInstance.post('/messages', {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body },
    });
  }

  private async generateUpiQrBuffer(orderId: string, amount: number): Promise<Buffer> {
    const vpa = this.configService.get<string>('MERCHANT_UPI_VPA');
    const name = this.configService.get<string>('MERCHANT_DISPLAY_NAME') || 'Daily Fresh';
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
        caption: this.messages.get('payment.upiQrCaption', {
          amount: Number(amount).toFixed(2),
        }),
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
      const pdf = await this.invoiceService.generateBill(
        order,
        order.user?.language ?? UserLanguage.EN,
      );
      const { url } = await this.uploadService.uploadFile({
        buffer: pdf,
        mimetype: 'application/pdf',
        originalname: filename,
      });

      // Only the caption is translated — the bill PDF itself is unchanged.
      // The order already carries its customer on most paths; fall back to a
      // lookup for a guest order that has a phone but no user record.
      const sendCaptioned = () =>
        this.sendDocument(
          phone,
          url,
          filename,
          this.messages.get('order.billCaption', { orderNumber: orderNo }),
        );

      if (order.user) {
        await this.messages.runWith(order.user.language, sendCaptioned);
      } else {
        await this.withCustomerLanguage(phone, sendCaptioned);
      }
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
          text: { body: this.messages.get('payment.screenshotNoOrder') },
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
        text: { body: this.messages.get('payment.screenshotReceived') },
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
