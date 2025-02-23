import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { PrismaService } from 'src/services/prisma.service';
import { UserTypeDto } from './dto/user-type.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    private prismaService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const isExist = await this.prismaService.user.findFirst({
      where: {
        phone: createUserDto.phone,
      },
    });

    if (isExist !== null) {
      return new BadRequestException('User already exist');
    }

    const password = await bcrypt.hash(createUserDto.password, 10);
    createUserDto.password = password;

    return this.prismaService.user.create({
      data: {
        name: createUserDto.name,
        phone: createUserDto.phone,
        password: createUserDto.password,
        userType: createUserDto.userType,
        address: createUserDto.address,
      },
    });
  }

  async login(data: LoginDto) {
    const isExist = await this.prismaService.user.findFirst({
      where: {
        phone: data.phone,
      },
    });

    if (isExist === null) {
      return new UnauthorizedException('User not found');
    }

    const comparePswd = await bcrypt.compare(data.password, isExist.password);

    const token = await this.jwtService.sign(
      {
        id: isExist.id,
        phone: isExist.phone,
      },
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
    return this.prismaService.user.findMany({});
  }

  findOne(id: string) {
    return this.prismaService.user.findFirst({
      where: {
        id: id,
      },
      include: {
        OutletAgent: {
          include: {
            outlet: true,
          },
        },
      },
    });
  }

  findByUserType(userType: UserTypeDto) {
    return this.prismaService.user.findMany({
      where: {
        userType: userType.userType,
      },
    });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return this.prismaService.user.update({
      where: {
        id: id,
      },
      data: updateUserDto,
    });
  }

  remove(id: string) {
    return this.prismaService.user.delete({
      where: {
        id: id,
      },
    });
  }

  async createStaff(data: CreateStaffDto) {
    const outlet = this.prismaService.outlets.findFirst({
      where: {
        id: data.outletId,
      },
    });

    if (!outlet) {
      return new BadRequestException('Outlet not found');
    }

    const user: any = await this.create(data as CreateUserDto);

    await this.prismaService.staff.create({
      data: {
        userId: user.id,
        outletId: data.outletId,
      },
    });

    return this.findOne(user.id);
  }

  async deleteStaff(id: string) {
    const staff = await this.prismaService.staff.findFirst({
      where: {
        userId: id,
      },
    });

    if (!staff) {
      return new BadRequestException('Staff not found');
    }

    await this.prismaService.staff.deleteMany({
      where: {
        userId: id,
      },
    });

    return this.remove(id);
  }
}
