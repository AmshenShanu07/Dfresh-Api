import { WhatsappService } from './whatsapp.service';

/**
 * Address-first shopping: the delivery address is confirmed (or a new one
 * entered) before any product is shown, so the ward → outlet → stock the cart
 * is built from can't change at checkout. Network sends are stubbed;
 * assertions are on which step the customer is sent to and what happens to
 * the cart and the order.
 */
const PHONE = '91999';
const WARD_A = 'ward-a';
const WARD_B = 'ward-b';
const outletA = {
  id: 'outlet-a',
  name: 'Outlet A',
  wardId: WARD_A,
  address: '',
};
const outletB = {
  id: 'outlet-b',
  name: 'Outlet B',
  wardId: WARD_B,
  address: '',
};

const catalog = {
  ShareCatalogProducts: [{ variantId: 'v-chicken' }, { variantId: 'v-fish' }],
  ShareCatalogProductStock: [
    { productId: 'p-chicken', remainingGrams: 10000 },
    { productId: 'p-fish', remainingGrams: 10000 },
  ],
};

// Outlet B has no fish.
const stockByOutlet: Record<string, Map<string, number>> = {
  'outlet-a': new Map([
    ['p-chicken', 5000],
    ['p-fish', 5000],
  ]),
  'outlet-b': new Map([['p-chicken', 5000]]),
};

function cartItems() {
  return [
    {
      id: 'ci-chicken',
      productId: 'p-chicken',
      variantId: 'v-chicken',
      quantity: 1,
      price: 200,
      variant: { weight: 500 },
      product: { name: { en: 'Chicken' } },
    },
    {
      id: 'ci-fish',
      productId: 'p-fish',
      variantId: 'v-fish',
      quantity: 1,
      price: 300,
      variant: { weight: 1000 },
      product: { name: { en: 'Fish' } },
    },
  ];
}

function buildService({
  address = { id: 'addr-1', wardId: WARD_A, areaId: null } as any,
  items = cartItems() as any[],
  confirmedAddressId = null as string | null,
  openCatalog = catalog as any,
} = {}) {
  let latest = address
    ? { name: 'Asha', address: 'House 1', ...address }
    : null;
  const cart = {
    id: 'cart-1',
    addressId: confirmedAddressId,
    outletId: null as string | null,
    cartItems: items,
  };

  const userAddressRepo = {
    findOne: jest.fn(async () => latest),
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => {
      latest = { id: 'addr-new', ...data };
      return latest;
    }),
    update: jest.fn(),
  };
  const outletsByWard: Record<string, any[]> = {
    [WARD_A]: [outletA],
    [WARD_B]: [outletB],
  };
  const orderService = {
    findSellingOutletsForWard: jest.fn(
      async (w: string) => outletsByWard[w] ?? [],
    ),
    findServiceableWardIds: jest.fn(async () => new Set([WARD_A, WARD_B])),
    getOrderOutlet: jest.fn(async () => outletA),
    createOrder: jest.fn(async () => ({ id: 'order-1' })),
    confirmOrderWithAddress: jest.fn(async () => ({
      id: 'order-1',
      totalAmount: 200,
    })),
    updateOrderAddress: jest.fn(async () => ({
      id: 'order-1',
      totalAmount: 200,
    })),
  };
  const cartService = {
    getCart: jest.fn(async () => cart),
    removeItem: jest.fn(async (_p: string, id: string) => {
      cart.cartItems = cart.cartItems.filter((i: any) => i.id !== id);
      return cart;
    }),
    getChosenOutletId: jest.fn(async () => cart.outletId),
    setChosenOutlet: jest.fn(async (_p: string, id: string) => {
      cart.outletId = id;
    }),
    setConfirmedAddress: jest.fn(async (_p: string, id: string) => {
      cart.addressId = id;
    }),
    clearCart: jest.fn(async () => {
      cart.cartItems = [];
      cart.addressId = null;
    }),
  };

  const service = new WhatsappService(
    {
      findOne: jest.fn(async () => ({
        id: 'user-1',
        phone: PHONE,
        name: 'Asha',
      })),
    } as any,
    userAddressRepo as any,
    {} as any, // shareCatalogRepository
    { get: () => '' } as any,
    orderService as any,
    {} as any, // uploadService
    cartService as any,
    {
      findAllActive: jest.fn(async () => [
        { id: WARD_A, wardName: { en: 'A' }, wardNumber: 1 },
        { id: WARD_B, wardName: { en: 'B' }, wardNumber: 2 },
      ]),
    } as any,
    { findActiveByWard: jest.fn(async () => []) } as any, // areaService
    {} as any, // invoiceService
    {
      get: (key: string, params?: any) =>
        params?.items ? `${key}:${params.items}` : key,
      currentLanguage: () => 'en',
      runWith: (_language: any, fn: () => any) => fn(),
    } as any,
    {
      getStockMap: jest.fn(async (id: string) => stockByOutlet[id]),
    } as any,
  ) as any;

  const posted: any[] = [];
  service.waInstance = {
    post: jest.fn(async (_url: string, payload: any) => {
      posted.push(payload);
      return { data: {} };
    }),
  };
  jest.spyOn(service, 'getOpenCatalog').mockResolvedValue(openCatalog);

  const sent = {
    text: jest.spyOn(service, 'sendText').mockResolvedValue(undefined),
    wardList: jest.spyOn(service, 'sendWardList'),
    categoryList: jest
      .spyOn(service, 'sendCategoryList')
      .mockResolvedValue(undefined),
    cartSummary: jest
      .spyOn(service, 'sendCartSummary')
      .mockResolvedValue(undefined),
    mainMenu: jest.spyOn(service, 'sendMainMenu').mockResolvedValue(undefined),
    payment: jest
      .spyOn(service, 'sendPaymentMethodButtons')
      .mockResolvedValue(undefined),
  };
  const buttonIds = () =>
    posted.flatMap(
      (p) => p.interactive?.action?.buttons?.map((b: any) => b.reply.id) ?? [],
    );
  const rowIds = () =>
    posted.flatMap(
      (p) =>
        p.interactive?.action?.sections?.flatMap((s: any) =>
          s.rows.map((r: any) => r.id),
        ) ?? [],
    );

  return {
    service,
    sent,
    cart,
    orderService,
    cartService,
    posted,
    buttonIds,
    rowIds,
  };
}

const flowReply = (token: string) =>
  JSON.stringify({
    flow_token: token,
    address: 'House 9',
    landmark: 'Temple',
    phone: PHONE,
  });

describe('View Products asks for the address before any product', () => {
  it('offers Deliver Here / Change Address for a saved address', async () => {
    const { service, sent, buttonIds } = buildService();

    await service.handleInteractiveReply(PHONE, 'get-catlog');

    expect(buttonIds()).toEqual(['addrOk~shop', 'addrNew~shop']);
    expect(sent.categoryList).not.toHaveBeenCalled();
  });

  it('asks for an address that leads back to the products when none is saved', async () => {
    const { service, sent } = buildService({ address: null });

    await service.handleInteractiveReply(PHONE, 'get-catlog');

    expect(sent.text).toHaveBeenCalledWith(PHONE, 'outlet.addressFirst');
    expect(sent.wardList).toHaveBeenCalledWith(PHONE, 0, 'shop');
    expect(sent.categoryList).not.toHaveBeenCalled();
  });

  it('the catalog broadcast asks too', async () => {
    const { service, buttonIds, sent } = buildService();

    await service.sendProduct(PHONE);

    expect(buttonIds()).toEqual(['addrOk~shop', 'addrNew~shop']);
    expect(sent.categoryList).not.toHaveBeenCalled();
  });

  it('Add More does not ask again', async () => {
    const { service, sent, buttonIds } = buildService();

    await service.handleInteractiveReply(PHONE, 'cartAddMore');

    expect(sent.categoryList).toHaveBeenCalled();
    expect(buttonIds()).toEqual([]);
  });
});

describe('answering the address question', () => {
  it('Deliver Here locks the cart to the address and shows the products', async () => {
    const { service, sent, cart } = buildService();

    await service.handleInteractiveReply(PHONE, 'addrOk~shop');

    expect(cart.addressId).toBe('addr-1');
    expect(sent.categoryList).toHaveBeenCalledWith(PHONE);
  });

  it('Change Address offers every serviceable ward, not one locked to an outlet', async () => {
    const { service, rowIds } = buildService();

    await service.handleInteractiveReply(PHONE, 'addrNew~shop');

    expect(rowIds()).toEqual([
      `pickWard~${WARD_A}~shop`,
      `pickWard~${WARD_B}~shop`,
    ]);
  });

  it('carries the context into the address form', async () => {
    const { service, posted } = buildService();

    await service.handleInteractiveReply(PHONE, `pickWard~${WARD_B}~shop`);

    expect(posted[0].interactive.action.parameters.flow_token).toBe(
      `WARD:${WARD_B}|NEXT:shop`,
    );
  });
});

describe('a new address entered before shopping', () => {
  it('becomes the confirmed address and shows the products', async () => {
    const { service, sent, cart } = buildService({ items: [] });

    await service.receiveAddress(PHONE, flowReply(`WARD:${WARD_B}|NEXT:shop`));

    expect(cart.addressId).toBe('addr-new');
    expect(sent.categoryList).toHaveBeenCalledWith(PHONE);
  });

  it("drops the cart items the new ward's outlet can't supply, and names them", async () => {
    const { service, sent, cart } = buildService();

    await service.receiveAddress(PHONE, flowReply(`WARD:${WARD_B}|NEXT:shop`));

    expect(cart.cartItems.map((i: any) => i.id)).toEqual(['ci-chicken']);
    expect(sent.text).toHaveBeenCalledWith(
      PHONE,
      'cart.itemsRemovedForAddress:• Fish',
    );
    expect(sent.categoryList).toHaveBeenCalled();
  });

  it('leaves a cart the new outlet fully covers untouched', async () => {
    const { service, sent, cart } = buildService();

    await service.receiveAddress(PHONE, flowReply(`WARD:${WARD_A}|NEXT:shop`));

    expect(cart.cartItems).toHaveLength(2);
    expect(sent.text).not.toHaveBeenCalled();
  });

  it('from the cart, returns to the cart summary', async () => {
    const { service, sent } = buildService();

    await service.receiveAddress(PHONE, flowReply(`WARD:${WARD_A}|NEXT:cart`));

    expect(sent.cartSummary).toHaveBeenCalledWith(PHONE);
    expect(sent.categoryList).not.toHaveBeenCalled();
  });

  it('an old checkout token still advances its order to payment', async () => {
    const { service, sent, orderService, cart } = buildService();

    await service.receiveAddress(PHONE, flowReply(`order-1|WARD:${WARD_A}`));

    expect(orderService.updateOrderAddress).toHaveBeenCalled();
    expect(sent.payment).toHaveBeenCalled();
    expect(cart.addressId).toBeNull();
  });

  it('onboarding (no context) just saves and shows the main menu', async () => {
    const { service, sent, cart } = buildService();

    await service.receiveAddress(PHONE, flowReply(`WARD:${WARD_A}`));

    expect(sent.mainMenu).toHaveBeenCalled();
    expect(cart.addressId).toBeNull();
  });
});

describe('checkout skips the address step', () => {
  it('asks for the address first when the cart has none confirmed', async () => {
    const { service, orderService, buttonIds } = buildService();

    await service.checkoutCart(PHONE);

    expect(buttonIds()).toEqual(['addrOk~cart', 'addrNew~cart']);
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('asks again when a newer address was added since', async () => {
    const { service, orderService } = buildService({
      confirmedAddressId: 'addr-old',
    });

    await service.checkoutCart(PHONE);

    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('places the order and goes straight to payment', async () => {
    const { service, sent, orderService, cart, buttonIds } = buildService({
      confirmedAddressId: 'addr-1',
    });

    await service.checkoutCart(PHONE);

    expect(orderService.createOrder).toHaveBeenCalledWith(
      PHONE,
      expect.any(Array),
      'outlet-a',
    );
    expect(orderService.confirmOrderWithAddress).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ address: 'House 1', wardId: WARD_A }),
    );
    expect(sent.payment).toHaveBeenCalled();
    expect(buttonIds()).toEqual([]); // no address buttons
    expect(cart.cartItems).toEqual([]);
    expect(cart.addressId).toBeNull();
  });

  it('Deliver Here from checkout confirms and places the order', async () => {
    const { service, orderService, sent } = buildService();

    await service.handleInteractiveReply(PHONE, 'addrOk~cart');

    expect(orderService.createOrder).toHaveBeenCalled();
    expect(sent.payment).toHaveBeenCalled();
  });

  it('still asks for the area again when the saved one was removed', async () => {
    const { service, orderService, rowIds } = buildService({
      address: { id: 'addr-1', wardId: WARD_A, areaId: 'area-gone' },
      confirmedAddressId: 'addr-1',
    });
    service.areaService.findActiveByWard = jest.fn(async () => [
      { id: 'area-live', outletId: 'outlet-a', name: { en: 'Live' } },
    ]);

    await service.checkoutCart(PHONE);

    expect(orderService.confirmOrderWithAddress).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(['fixArea~area-live~order-1']);
  });
});

describe('Settings menu', () => {
  it('replaces Change Language on the main menu', async () => {
    const { service } = buildService();

    const ids = (await service.entryButtons(PHONE)).map((b: any) => b.reply.id);

    expect(ids).toEqual(['get-catlog', 'cartView', 'settings']);
  });

  it('offers Change Language and Change Address', async () => {
    const { service, buttonIds } = buildService();

    await service.handleInteractiveReply(PHONE, 'settings');

    expect(buttonIds()).toEqual(['changeLang', 'settingsAddr']);
  });

  it('Change Address starts at the ward list', async () => {
    const { service, sent } = buildService();

    await service.handleInteractiveReply(PHONE, 'settingsAddr');

    expect(sent.wardList).toHaveBeenCalledWith(PHONE, 0, 'settings');
  });

  it('a new address from Settings re-checks the cart and ends on the main menu', async () => {
    const { service, sent, cart } = buildService();

    await service.receiveAddress(
      PHONE,
      flowReply(`WARD:${WARD_B}|NEXT:settings`),
    );

    expect(cart.addressId).toBe('addr-new');
    expect(cart.cartItems.map((i: any) => i.id)).toEqual(['ci-chicken']);
    expect(sent.text).toHaveBeenCalledWith(PHONE, 'settings.addressUpdated');
    expect(sent.mainMenu).toHaveBeenCalled();
  });
});

describe('changing outlet re-checks the cart', () => {
  it('drops what the picked outlet lacks before showing products', async () => {
    const { service, sent, cart, orderService } = buildService({
      address: { id: 'addr-1', wardId: WARD_B, areaId: null },
    });
    // Both outlets sell into ward B here.
    orderService.findSellingOutletsForWard.mockResolvedValue([
      outletA,
      outletB,
    ]);

    await service.handleInteractiveReply(PHONE, 'pickOutlet~outlet-b');

    expect(cart.outletId).toBe('outlet-b');
    expect(cart.cartItems.map((i: any) => i.id)).toEqual(['ci-chicken']);
    expect(sent.categoryList).toHaveBeenCalled();
  });
});

describe('address flow token', () => {
  it('round-trips the next step', () => {
    const { service } = buildService();
    const token = service.buildAddressFlowToken(WARD_A, 'cart', 'area-1');

    expect(token).toBe(`WARD:${WARD_A}|AREA:area-1|NEXT:cart`);
    expect(service.parseAddressFlowToken(token)).toEqual({
      wardId: WARD_A,
      areaId: 'area-1',
      orderId: null,
      next: 'cart',
    });
  });

  it('still parses a legacy plain order id', () => {
    const { service } = buildService();

    expect(service.parseAddressFlowToken('order-9')).toEqual({
      wardId: null,
      areaId: null,
      orderId: 'order-9',
      next: null,
    });
  });
});
