import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/services/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
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

    return this.prismaService.user.create({ data: createUserDto });
  }

  async login(data: LoginDto) {
    const isExist = await this.prismaService.user.findFirst({
      where: {
        phone: data.phone,
      },
    });

    console.log(isExist, data);

    if (isExist === null) {
      return new UnauthorizedException('User not found');
    }

    const comparePswd = await bcrypt.compare(data.password, isExist.password);

    if (!comparePswd) {
      return new UnauthorizedException('Password not match');
    }

    return isExist;
  }

  findAll() {
    return this.prismaService.user.findMany({});
  }

  findOne(id: string) {
    return this.prismaService.user.findFirst({
      where: {
        id: id,
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
}
