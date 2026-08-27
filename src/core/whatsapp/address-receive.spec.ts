import { WhatsappService } from './whatsapp.service';
import { User, UserAddress } from '../users/entities/user.entity';

describe('WhatsappService.receiveAddress', () => {
  let service: WhatsappService;
  let fakeUserRepo: any;
  let fakeUserAddressRepo: any;
  let fakeOrderService: any;
  let savedAddresses: Partial<UserAddress>[];
  let updatedOrderAddress: any;

  beforeEach(() => {
    savedAddresses = [];
    updatedOrderAddress = null;

    fakeUserRepo = {
      findOne: jest.fn().mockImplementation(async ({ where: { phone } }) => {
        if (phone === '919876543210') {
          return {
            id: 'user-1',
            name: 'Rahul Sharma',
            phone: '919876543210',
          } as User;
        }
        return null;
      }),
    };

    fakeUserAddressRepo = {
      create: jest.fn().mockImplementation((data: any) => data),
      save: jest.fn().mockImplementation(async (data: any) => {
        savedAddresses.push(data);
        return data;
      }),
    };

    fakeOrderService = {
      updateOrderAddress: jest.fn().mockImplementation(async (data: any) => {
        updatedOrderAddress = data;
        return { id: data.flow_token, totalAmount: 500 };
      }),
    };

    const fakeConfigService = {
      get: jest.fn().mockReturnValue('mock-val'),
    };

    const fakeMessagesService = {
      get: jest.fn().mockReturnValue('mock-message'),
    };

    service = new WhatsappService(
      fakeUserRepo,
      fakeUserAddressRepo,
      {} as any, // shareCatalogRepository
      fakeConfigService as any,
      fakeOrderService as any,
      {} as any, // uploadService
      {} as any, // cartService
      {} as any, // wardService
      {} as any, // areaService
      {} as any, // invoiceService
      fakeMessagesService as any,
    );

    // Mock network call methods so they don't hit WhatsApp APIs
    jest.spyOn(service as any, 'sendPaymentMethodButtons').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'sendMainMenu').mockResolvedValue(undefined);
  });

  it('uses user.name for UserAddress when WhatsApp Flow does not send name', async () => {
    const flowJson = JSON.stringify({
      flow_token: 'WARD:10',
      address: 'Flat 4B, Palm Grove',
      landmark: 'Near Metro Pillar 120',
      pincode: '682001',
      phone: '9876500000',
    });

    await service.receiveAddress('919876543210', flowJson);

    expect(savedAddresses).toHaveLength(1);
    expect(savedAddresses[0]).toMatchObject({
      userId: 'user-1',
      name: 'Rahul Sharma',
      address: 'Flat 4B, Palm Grove',
      landmark: 'Near Metro Pillar 120',
      pinCode: '682001',
      phone: '9876500000',
      wardId: '10',
    });
  });

  it('populates user.name into DeliveryDetails for checkout orders', async () => {
    const flowJson = JSON.stringify({
      flow_token: 'order-123|WARD:10|AREA:area-5',
      address: 'Flat 4B, Palm Grove',
      landmark: 'Near Metro Pillar 120',
      pincode: '682001',
      phone: '9876500000',
    });

    await service.receiveAddress('919876543210', flowJson);

    expect(savedAddresses).toHaveLength(1);
    expect(savedAddresses[0].name).toBe('Rahul Sharma');

    expect(fakeOrderService.updateOrderAddress).toHaveBeenCalledTimes(1);
    expect(updatedOrderAddress).toMatchObject({
      flow_token: 'order-123',
      name: 'Rahul Sharma',
      address: 'Flat 4B, Palm Grove',
      landmark: 'Near Metro Pillar 120',
      pinCode: '682001',
      phone: '9876500000',
      wardId: '10',
      areaId: 'area-5',
    });
  });

  it('falls back to the WhatsApp phone number when phone is missing from flow form', async () => {
    const flowJson = JSON.stringify({
      flow_token: 'order-456',
      address: 'House No 12',
      landmark: '',
      pincode: '682002',
    });

    await service.receiveAddress('919876543210', flowJson);

    expect(savedAddresses).toHaveLength(1);
    expect(savedAddresses[0].phone).toBe('919876543210');
    expect(savedAddresses[0].name).toBe('Rahul Sharma');
    expect(updatedOrderAddress.phone).toBe('919876543210');
    expect(updatedOrderAddress.name).toBe('Rahul Sharma');
  });
});
