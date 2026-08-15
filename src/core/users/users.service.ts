import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UserTypeDto } from './dto/user-type.dto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { User } from './entities/user.entity';
import { Staff } from './entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { OrderDetails } from '../order/entities/order.entity';
import { deriveOrderNumber } from '../order/order-number.util';
import { UserTypes, OrderStatus } from 'src/common/enums';
import { AreaService, AreaInput } from '../area/area.service';
import { normalisePhone } from 'src/common/utils/phone';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(Outlets)
    private outletRepository: Repository<Outlets>,
    @InjectRepository(OrderDetails)
    private orderRepository: Repository<OrderDetails>,
    private jwtService: JwtService,
    private areaService: AreaService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const isExist = await this.userRepository.findOne({
      where: { phone: createUserDto.phone },
    });

    if (isExist !== null) {
      throw new BadRequestException('User already exist');
    }

    const password = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      name: createUserDto.name,
      phone: createUserDto.phone,
      password,
      userType: createUserDto.userType,
      address: createUserDto.address,
    });

    return this.userRepository.save(user);
  }

  async login(data: LoginDto) {
    const isExist = await this.userRepository.findOne({
      where: {
        phone: data.phone,
        userType: Not(UserTypes.CUSTOMER),
      },
    });

    if (isExist === null) {
      throw new UnauthorizedException('User not found');
    }
    const comparePswd = await bcrypt.compare(data.password, isExist.password);

    if (!comparePswd) {
      throw new UnauthorizedException('Password not match');
    }

    const token = await this.jwtService.sign(
      { id: isExist.id, phone: isExist.phone, userType: isExist.userType },
      { secret: 'dfresh' },
    );

    const user = { ...isExist };
    delete user.password;

    return { user, token };
  }

  findAll() {
    return this.userRepository.find({
      relations: { outletAgent: { outlet: true } },
    });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { outletAgent: { outlet: true } },
    });

    if (!user) {
      return null;
    }

    // Never hand the password hash back to a client.
    const result: any = { ...user };
    delete result.password;

    // Pre-fills the Areas table on the edit-staff form.
    result.areas =
      user.userType === UserTypes.OUTLET_AGENT
        ? await this.areaService.findByUser(id)
        : [];

    return result;
  }

  findByUserType(userType: UserTypeDto) {
    return this.userRepository.find({
      where: { userType: userType.userType },
    });
  }

  // Staff Management list — everyone except customers.
  async findAllStaff() {
    const users = await this.userRepository.find({
      where: { userType: Not(UserTypes.CUSTOMER) },
      relations: { outletAgent: { outlet: true } },
    });
    return users.map(({ password, ...rest }) => rest);
  }

  // Customer Management list — order count excludes DRAFT (abandoned carts)
  // and CANCELLED (never fulfilled/paid) orders, computed in a single query
  // via loadRelationCountAndMap rather than N+1 per-customer lookups.
  async findAllCustomers() {
    const customers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.userType = :userType', { userType: UserTypes.CUSTOMER })
      .loadRelationCountAndMap(
        'user.orderCount',
        'user.OrderDetails',
        'order',
        (qb) =>
          qb.andWhere('order.status NOT IN (:...excluded)', {
            excluded: [OrderStatus.DRAFT, OrderStatus.CANCELLED],
          }),
      )
      .orderBy('user.createdAt', 'DESC')
      .getMany();
    return customers.map(({ password, ...rest }) => rest);
  }

  /**
   * One customer by phone, for the manual-order form's lookup. The number is
   * normalised to the WhatsApp `wa_id` form first so a staff member typing
   * `9876543210` finds the customer the bot stored as `919876543210`.
   *
   * Returns null rather than throwing: "no such customer yet" is the normal
   * path into inline creation, not an error.
   */
  async lookupCustomerByPhone(phone: string) {
    const normalised = normalisePhone(phone ?? '');
    if (!normalised) return null;

    const customer = await this.userRepository.findOne({
      where: { phone: normalised, userType: UserTypes.CUSTOMER },
    });
    if (!customer) return null;

    return { id: customer.id, name: customer.name, phone: customer.phone };
  }

  // Customer detail page — profile plus qualifying order history and total
  // spent. Same DRAFT/CANCELLED exclusion as findAllCustomers, so the order
  // count shown here always matches the list page.
  async findCustomerDetail(id: string) {
    const customer = await this.userRepository.findOne({
      where: { id, userType: UserTypes.CUSTOMER },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const orders = await this.orderRepository.find({
      where: {
        userId: id,
        status: In([
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.DISPATCHED,
          OrderStatus.DELIVERED,
        ]),
      },
      order: { createdAt: 'DESC' },
    });

    const totalSpent = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const { password, ...customerInfo } = customer;

    return {
      ...customerInfo,
      orderCount: orders.length,
      totalSpent,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: deriveOrderNumber(o),
        status: o.status,
        totalAmount: o.totalAmount,
        createdAt: o.createdAt,
      })),
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.userRepository.update(id, updateUserDto);
    return this.userRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.userRepository.delete(id);
    return { id };
  }

  async createStaff(data: CreateStaffDto) {
    const outlet = await this.outletRepository.findOne({
      where: { id: data.outletId },
    });

    if (!outlet) {
      return new BadRequestException('Outlet not found');
    }

    const user: any = await this.create(data as CreateUserDto);

    await this.staffRepository.save(
      this.staffRepository.create({
        userId: user.id,
        outletId: data.outletId,
      }),
    );

    if (data.userType === UserTypes.OUTLET_AGENT) {
      await this.areaService.reconcileAreasForStaff(
        user.id,
        data.outletId,
        data.areas ?? [],
      );
    }

    return this.findOne(user.id);
  }

  async updateStaff(id: string, data: UpdateStaffDto) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Staff not found');
    }

    // `phone` is unique and doubles as the login id, so guard it against
    // collisions with anyone other than this user.
    if (data.phone && data.phone !== user.phone) {
      const duplicate = await this.userRepository.findOne({
        where: { phone: data.phone },
      });

      if (duplicate) {
        throw new BadRequestException('User already exist');
      }
    }

    // Explicit field picks. The password is only touched when the admin
    // explicitly supplies a new one — otherwise the existing hash survives.
    await this.userRepository.update(id, {
      name: data.name ?? user.name,
      phone: data.phone ?? user.phone,
      userType: data.userType ?? user.userType,
      address: data.address ?? user.address,
      email: data.email ?? user.email,
      ...(data.password
        ? { password: await bcrypt.hash(data.password, 10) }
        : {}),
    });

    await this.syncStaffOutlet(
      id,
      data.userType ?? user.userType,
      data.outletId,
      data.areas,
    );

    return this.findOne(id);
  }

  // Keeps the Staff join row in step with the user's role: outlet agents get
  // a row pointing at the chosen outlet, everyone else gets none. Also
  // reconciles the agent's Area list whenever one is explicitly submitted
  // (an omitted `areas` means "not touched by this update", an empty array
  // means "remove all areas" — both are valid, so this must check `!==
  // undefined` rather than truthiness).
  private async syncStaffOutlet(
    userId: string,
    userType: UserTypes,
    outletId?: string,
    areas?: AreaInput[],
  ) {
    const staff = await this.staffRepository.findOne({ where: { userId } });
    const isOutletAgent = userType === UserTypes.OUTLET_AGENT;

    if (isOutletAgent && outletId) {
      const outlet = await this.outletRepository.findOne({
        where: { id: outletId },
      });

      if (!outlet) {
        throw new BadRequestException('Outlet not found');
      }

      if (staff) {
        await this.staffRepository.update(staff.id, { outletId });
      } else {
        await this.staffRepository.save(
          this.staffRepository.create({ userId, outletId }),
        );
      }

      if (areas !== undefined) {
        await this.areaService.reconcileAreasForStaff(userId, outletId, areas);
      }

      return;
    }

    if (!isOutletAgent && staff) {
      await this.staffRepository.delete({ userId });
      await this.areaService.deactivateAreasForUser(userId);
    }
  }

  async deleteStaff(id: string) {
    const staff = await this.staffRepository.findOne({
      where: { userId: id },
    });

    if (!staff) {
      return new BadRequestException('Staff not found');
    }

    await this.staffRepository.delete({ userId: id });
    await this.areaService.deactivateAreasForUser(id);

    return this.remove(id);
  }
}
