import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserLanguage, UserTypes } from 'src/common/enums';

/**
 * Covers `UsersService.updateCustomer`, the admin-facing customer edit.
 *
 * The cases here are the ones that are cheap to get wrong and expensive to
 * discover in production: the phone doubles as the WhatsApp `wa_id` and is
 * unique, and the neighbouring `update()` writes whatever the DTO hands it —
 * so "the password hash survived" is a real assertion, not a formality.
 */

const CUSTOMER_ID = 'customer-1';

function customerRow(overrides: any = {}) {
  return {
    id: CUSTOMER_ID,
    name: 'Old Name',
    phone: '919876543210',
    password: 'existing-bcrypt-hash',
    userType: UserTypes.CUSTOMER,
    email: 'old@example.com',
    address: '',
    language: UserLanguage.EN,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

class FakeUserRepository {
  rows: any[];
  updates: { id: string; patch: any }[] = [];

  constructor(rows: any[]) {
    this.rows = rows;
  }

  async findOne({ where }: any) {
    return (
      this.rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key] === value),
      ) ?? null
    );
  }

  async update(id: string, patch: any) {
    this.updates.push({ id, patch });
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  }
}

class FakeAddressRepository {
  rows: any[];
  updates: { id: string; patch: any }[] = [];
  saved: any[] = [];

  constructor(rows: any[] = []) {
    this.rows = rows;
  }

  async findOne({ where }: any) {
    return this.rows.find((row) => row.userId === where.userId) ?? null;
  }

  create(data: any) {
    return { ...data };
  }

  async save(data: any) {
    const stored = { id: 'address-generated', ...data };
    this.saved.push(stored);
    return stored;
  }

  async update(id: string, patch: any) {
    this.updates.push({ id, patch });
  }
}

const emptyOrderRepository = { find: async () => [] } as any;

function buildService({
  users = [customerRow()],
  addresses = [] as any[],
  area = null as any,
  wardExists = true,
} = {}) {
  const userRepository = new FakeUserRepository(users);
  const addressRepository = new FakeAddressRepository(addresses);

  const areaService = {
    findOneActive: async (_id: string) => area,
  } as any;

  const wardService = {
    findOne: async (_id: string) => {
      if (!wardExists) throw new NotFoundException('Ward not found');
      return { id: 'ward-1' };
    },
  } as any;

  const service = new UsersService(
    userRepository as any,
    addressRepository as any,
    null as any,
    null as any,
    emptyOrderRepository,
    null as any,
    areaService,
    wardService,
  );

  return { service, userRepository, addressRepository };
}

describe('UsersService.updateCustomer', () => {
  it('normalises a 10-digit phone to the wa_id form before saving', async () => {
    const { service, userRepository } = buildService();

    await service.updateCustomer(CUSTOMER_ID, { phone: '9812345678' });

    expect(userRepository.updates[0].patch.phone).toBe('919812345678');
  });

  it('accepts an unchanged phone without a duplicate lookup failure', async () => {
    const { service, userRepository } = buildService();

    await service.updateCustomer(CUSTOMER_ID, { phone: '9876543210' });

    expect(userRepository.updates[0].patch.phone).toBe('919876543210');
  });

  it('rejects a phone already held by another user', async () => {
    const { service } = buildService({
      users: [
        customerRow(),
        customerRow({ id: 'customer-2', phone: '919999999999' }),
      ],
    });

    await expect(
      service.updateCustomer(CUSTOMER_ID, { phone: '9999999999' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never writes password or userType', async () => {
    const { service, userRepository } = buildService();

    await service.updateCustomer(CUSTOMER_ID, {
      name: 'New Name',
      // Present on the wire but absent from the DTO — must not reach the DB.
      password: 'plaintext',
      userType: UserTypes.ADMIN,
    } as any);

    const { patch } = userRepository.updates[0];
    expect(patch).not.toHaveProperty('password');
    expect(patch).not.toHaveProperty('userType');
    expect(patch.name).toBe('New Name');
  });

  it('leaves omitted fields at their existing values', async () => {
    const { service, userRepository } = buildService();

    await service.updateCustomer(CUSTOMER_ID, { name: 'Only Name' });

    const { patch } = userRepository.updates[0];
    expect(patch.email).toBe('old@example.com');
    expect(patch.phone).toBe('919876543210');
  });

  it('404s when the id is not a customer', async () => {
    const { service } = buildService({
      users: [customerRow({ userType: UserTypes.ADMIN })],
    });

    await expect(
      service.updateCustomer(CUSTOMER_ID, { name: 'Nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates the existing address in place rather than adding a row', async () => {
    const { service, addressRepository } = buildService({
      addresses: [
        { id: 'address-1', userId: CUSTOMER_ID, address: 'Old street' },
      ],
    });

    await service.updateCustomer(CUSTOMER_ID, {
      address: {
        address: 'New street',
        landmark: 'Near temple',
        pinCode: '682001',
        name: 'Receiver',
        phone: '9812345678',
        wardId: 'ward-1',
      },
    });

    expect(addressRepository.saved).toHaveLength(0);
    expect(addressRepository.updates).toHaveLength(1);
    expect(addressRepository.updates[0].id).toBe('address-1');
    expect(addressRepository.updates[0].patch.address).toBe('New street');
  });

  it('creates an address when the customer has none', async () => {
    const { service, addressRepository } = buildService({ addresses: [] });

    await service.updateCustomer(CUSTOMER_ID, {
      address: {
        address: 'First street',
        pinCode: '682001',
        wardId: 'ward-1',
      },
    });

    expect(addressRepository.updates).toHaveLength(0);
    expect(addressRepository.saved).toHaveLength(1);
    expect(addressRepository.saved[0].userId).toBe(CUSTOMER_ID);
    expect(addressRepository.saved[0].address).toBe('First street');
  });

  it('falls back to the customer phone when the address carries none', async () => {
    const { service, addressRepository } = buildService({ addresses: [] });

    await service.updateCustomer(CUSTOMER_ID, {
      address: { address: 'First street', pinCode: '682001', wardId: 'ward-1' },
    });

    expect(addressRepository.saved[0].phone).toBe('919876543210');
  });

  it('rejects an area belonging to a different ward', async () => {
    const { service } = buildService({
      area: { id: 'area-1', wardId: 'ward-2' },
    });

    await expect(
      service.updateCustomer(CUSTOMER_ID, {
        address: {
          address: 'Street',
          pinCode: '682001',
          wardId: 'ward-1',
          areaId: 'area-1',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an area that belongs to the selected ward', async () => {
    const { service, addressRepository } = buildService({
      area: { id: 'area-1', wardId: 'ward-1' },
    });

    await service.updateCustomer(CUSTOMER_ID, {
      address: {
        address: 'Street',
        pinCode: '682001',
        wardId: 'ward-1',
        areaId: 'area-1',
      },
    });

    expect(addressRepository.saved[0].areaId).toBe('area-1');
  });

  it('rejects an unknown ward', async () => {
    const { service } = buildService({ wardExists: false });

    await expect(
      service.updateCustomer(CUSTOMER_ID, {
        address: { address: 'Street', pinCode: '682001', wardId: 'ward-x' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leaves the address untouched when the payload omits it', async () => {
    const { service, addressRepository } = buildService({
      addresses: [{ id: 'address-1', userId: CUSTOMER_ID, address: 'Old' }],
    });

    await service.updateCustomer(CUSTOMER_ID, { name: 'Renamed' });

    expect(addressRepository.updates).toHaveLength(0);
    expect(addressRepository.saved).toHaveLength(0);
  });
});
