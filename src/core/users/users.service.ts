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
import { Repository, Not } from 'typeorm';
import { User } from './entities/user.entity';
import { Staff } from './entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { UserTypes } from 'src/common/enums';

// Roles that operate out of a specific outlet, so they carry a Staff join row.
// Mirrors OUTLET_REQUIRED_ROLES in the dashboard's staff form.
const OUTLET_ROLES: UserTypes[] = [
  UserTypes.OUTLET_AGENT,
  UserTypes.DELIVERY_AGENT,
];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Staff)
    private staffRepository: Repository<Staff>,
    @InjectRepository(Outlets)
    private outletRepository: Repository<Outlets>,
    private jwtService: JwtService,
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
      return new UnauthorizedException('User not found');
    }
    console.log(isExist.password, data);
    const comparePswd = await bcrypt.compare(data.password, isExist.password);

    const token = await this.jwtService.sign(
      { id: isExist.id, phone: isExist.phone },
      { secret: 'dfresh' },
    );

    if (!comparePswd) {
      return new UnauthorizedException('Password not match');
    }

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
    const result = { ...user };
    delete result.password;

    return result;
  }

  findByUserType(userType: UserTypeDto) {
    return this.userRepository.find({
      where: { userType: userType.userType },
    });
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

    // Explicit field picks — the password is deliberately left alone so the
    // existing hash survives an edit.
    await this.userRepository.update(id, {
      name: data.name ?? user.name,
      phone: data.phone ?? user.phone,
      userType: data.userType ?? user.userType,
      address: data.address ?? user.address,
      email: data.email ?? user.email,
    });

    await this.syncStaffOutlet(
      id,
      data.userType ?? user.userType,
      data.outletId,
    );

    return this.findOne(id);
  }

  // Keeps the Staff join row in step with the user's role: outlet roles get a
  // row pointing at the chosen outlet, everyone else gets none.
  private async syncStaffOutlet(
    userId: string,
    userType: UserTypes,
    outletId?: string,
  ) {
    const staff = await this.staffRepository.findOne({ where: { userId } });

    if (OUTLET_ROLES.includes(userType) && outletId) {
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

      return;
    }

    if (!OUTLET_ROLES.includes(userType) && staff) {
      await this.staffRepository.delete({ userId });
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

    return this.remove(id);
  }
}
