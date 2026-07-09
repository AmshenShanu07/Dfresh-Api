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
import { UserTypeDto } from './dto/user-type.dto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { User } from './entities/user.entity';
import { Staff } from './entities/staff.entity';
import { Outlets } from '../outlet/entities/outlet.entity';
import { UserTypes } from 'src/common/enums';

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
      return new BadRequestException('User already exist');
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

  findOne(id: string) {
    return this.userRepository.findOne({
      where: { id },
      relations: { outletAgent: { outlet: true } },
    });
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
