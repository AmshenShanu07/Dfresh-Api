import { WhatsappService } from './whatsapp.service';

/**
 * Outlet choice before browsing, and the saved-address area re-check at
 * checkout. Network sends are stubbed; assertions are on which step the
 * customer is sent to.
 */
const WARD = 'ward-1';
const outletA = { id: 'outlet-a', name: 'Outlet A', wardId: WARD, address: '' };
const outletB = { id: 'outlet-b', name: 'Outlet B', wardId: WARD, address: '' };

function buildService({
  address = { id: 'addr-1', wardId: WARD, areaId: null as string | null },
  outlets = [outletA] as any[],
  chosenOutletId = null as string | null,
  orderOutlet = null as any,
  activeAreas = [] as any[],
} = {}) {
  const addressRow = address ? { ...address } : null;
  const userAddressRepo = {
    findOne: jest.fn(async () => addressRow),
    update: jest.fn(async (_id: string, patch: any) => {
      Object.assign(addressRow!, patch);
    }),
  };
  const orderService = {
    findSellingOutletsForWard: jest.fn(async () => outlets),
    getOrderOutlet: jest.fn(async () => orderOutlet),
    confirmOrderWithAddress: jest.fn(async () => ({
      id: 'order-1',
      totalAmount: 100,
    })),
  };
  const service = new WhatsappService(
    { findOne: jest.fn(async () => ({ id: 'user-1', phone: '91999' })) } as any,
    userAddressRepo as any,
    {} as any, // shareCatalogRepository
    { get: () => '' } as any,
    orderService as any,
    {} as any, // uploadService
    {
      getChosenOutletId: jest.fn(async () => chosenOutletId),
      setChosenOutlet: jest.fn(),
    } as any,
    {} as any, // wardService
    { findActiveByWard: jest.fn(async () => activeAreas) } as any,
    {} as any, // invoiceService
    { get: (key: string) => key, currentLanguage: () => 'en' } as any,
    {
      getStockMap: jest.fn(
        async (id: string) => new Map([[`stock-of-${id}`, 1]]),
      ),
    } as any,
  );
  const sent = {
    text: jest.spyOn(service as any, 'sendText').mockResolvedValue(undefined),
    wardList: jest.spyOn(service, 'sendWardList').mockResolvedValue(undefined),
    outletList: jest
      .spyOn(service as any, 'sendOutletList')
      .mockResolvedValue(undefined),
    areaList: jest.spyOn(service, 'sendAreaList'),
    payment: jest
      .spyOn(service as any, 'sendPaymentMethodButtons')
      .mockResolvedValue(undefined),
  };
  return { service: service as any, sent, orderService, userAddressRepo };
}

describe('resolveShoppingOutlet', () => {
  it('uses the only selling outlet of the ward automatically', async () => {
    const { service } = buildService({ outlets: [outletA] });

    const result = await service.resolveShoppingOutlet('91999', true);

    expect(result.outlet).toBe(outletA);
    expect(result.stock.has('stock-of-outlet-a')).toBe(true);
  });

  it('sends the outlet picker in a multi-outlet ward with no choice yet', async () => {
    const { service, sent } = buildService({ outlets: [outletA, outletB] });

    const result = await service.resolveShoppingOutlet('91999', true);

    expect(result).toBe('prompted');
    expect(sent.outletList).toHaveBeenCalledWith('91999', [outletA, outletB]);
  });

  it('uses the outlet the customer picked earlier', async () => {
    const { service, sent } = buildService({
      outlets: [outletA, outletB],
      chosenOutletId: 'outlet-b',
    });

    const result = await service.resolveShoppingOutlet('91999', true);

    expect(result.outlet).toBe(outletB);
    expect(sent.outletList).not.toHaveBeenCalled();
  });

  it('asks for the address first when the customer has no saved ward', async () => {
    const { service, sent } = buildService({ address: null as any });

    const result = await service.resolveShoppingOutlet('91999', true);

    expect(result).toBe('prompted');
    expect(sent.text).toHaveBeenCalledWith('91999', 'outlet.addressFirst');
    expect(sent.wardList).toHaveBeenCalledWith('91999');
  });

  it('falls back to catalog-only stock when no outlet sells in the ward', async () => {
    const { service } = buildService({ outlets: [] });

    const result = await service.resolveShoppingOutlet('91999', true);

    expect(result).toEqual({ outlet: null, stock: null, outlets: [] });
  });
});

describe('confirming a saved address whose area was removed', () => {
  const liveArea = {
    id: 'area-new',
    outletId: 'outlet-a',
    name: { en: 'New' },
  };

  it('asks for the area again instead of confirming without an agent', async () => {
    const { service, sent, orderService } = buildService({
      address: { id: 'addr-1', wardId: WARD, areaId: 'area-removed' },
      orderOutlet: outletA,
      activeAreas: [liveArea],
    });
    sent.areaList.mockResolvedValue(undefined);

    await service.handleConfirmAddress('91999', 'order-1');

    expect(sent.areaList).toHaveBeenCalledWith(
      '91999',
      WARD,
      0,
      'order-1',
      'repick',
    );
    expect(orderService.confirmOrderWithAddress).not.toHaveBeenCalled();
  });

  it('stores the re-picked area on the saved address and continues to payment', async () => {
    const { service, sent, orderService, userAddressRepo } = buildService({
      address: { id: 'addr-1', wardId: WARD, areaId: 'area-removed' },
      orderOutlet: outletA,
      activeAreas: [liveArea],
    });

    await service.handleRepickArea('91999', 'area-new', 'order-1');

    expect(userAddressRepo.update).toHaveBeenCalledWith('addr-1', {
      areaId: 'area-new',
    });
    expect(orderService.confirmOrderWithAddress).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ areaId: 'area-new' }),
    );
    expect(sent.payment).toHaveBeenCalled();
  });

  it("only offers areas owned by the order's outlet", async () => {
    const otherOutletArea = {
      id: 'area-b',
      outletId: 'outlet-b',
      name: { en: 'B' },
    };
    const { service, orderService } = buildService({
      address: { id: 'addr-1', wardId: WARD, areaId: 'area-b' },
      orderOutlet: outletA,
      activeAreas: [liveArea, otherOutletArea],
    });
    jest.spyOn(service, 'sendAreaList').mockResolvedValue(undefined);

    // area-b is active but belongs to Outlet B, so it doesn't count.
    await service.handleConfirmAddress('91999', 'order-1');

    expect(orderService.confirmOrderWithAddress).not.toHaveBeenCalled();
  });
});
