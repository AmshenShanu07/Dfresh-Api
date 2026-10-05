import { UnauthorizedException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { NON_LOGIN_USER_TYPES, UsersService } from './users.service';
import { UserTypes } from 'src/common/enums';

/**
 * Covers `UsersService.login`, the dashboard sign-in.
 *
 * Suppliers are created with a shared default password because they never
 * sign in, so the real guard is the userType filter on the lookup. The fake
 * repository evaluates that `Not(In([...]))` operator the way Postgres would,
 * so a supplier row with a matching password must still be rejected.
 */

const PASSWORD = 'Supplier@123';

function matches(value: any, condition: any): boolean {
  if (condition instanceof FindOperator) {
    // `.value` unwraps nested operators, so read the inner `In` via `.child`.
    if (condition.type === 'not')
      return !matches(value, condition.child ?? condition.value);
    if (condition.type === 'in') return (condition.value as any[]).includes(value);
    throw new Error(`Unhandled operator ${condition.type}`);
  }
  return value === condition;
}

function buildService(rows: any[]) {
  const userRepository = {
    findOne: async ({ where }: any) =>
      rows.find((row) =>
        Object.entries(where).every(([key, condition]) =>
          matches(row[key], condition),
        ),
      ) ?? null,
  };
  const jwtService = { sign: () => 'signed-token' };

  return new UsersService(
    userRepository as any,
    null as any,
    null as any,
    null as any,
    null as any,
    jwtService as any,
    null as any,
    null as any,
  );
}

async function userRow(userType: UserTypes) {
  return {
    id: `user-${userType}`,
    phone: '9876543210',
    password: await bcrypt.hash(PASSWORD, 4),
    userType,
  };
}

describe('UsersService.login', () => {
  it('blocks customers and suppliers', () => {
    expect(NON_LOGIN_USER_TYPES).toEqual([
      UserTypes.CUSTOMER,
      UserTypes.SUPPLIER,
    ]);
  });

  it.each([UserTypes.SUPPLIER, UserTypes.CUSTOMER])(
    'rejects a %s even with the correct password',
    async (userType) => {
      const service = buildService([await userRow(userType)]);

      await expect(
        service.login({ phone: '9876543210', password: PASSWORD }),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it.each([
    UserTypes.ADMIN,
    UserTypes.CENTRAL_STAFF,
    UserTypes.PURCHASE_STAFF,
    UserTypes.OUTLET_AGENT,
  ])('lets a %s sign in and strips the password', async (userType) => {
    const service = buildService([await userRow(userType)]);

    const result = await service.login({
      phone: '9876543210',
      password: PASSWORD,
    });

    expect(result.token).toBe('signed-token');
    expect(result.user.userType).toBe(userType);
    expect(result.user).not.toHaveProperty('password');
  });
});
