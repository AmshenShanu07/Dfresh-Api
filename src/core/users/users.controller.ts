import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UserTypeDto } from './dto/user-type.dto';

@ApiTags('Manage Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Post('/login')
  login(@Body() data: LoginDto) {
    return this.usersService.login(data);
  }

  @Post('create-staff')
  createStaff(@Body() createStaffDto: CreateStaffDto) {
    return this.usersService.createStaff(createStaffDto);
  }

  @Get('all')
  findAll() {
    return this.usersService.findAll();
  }

  @Get('user-type')
  findUserType(@Query() query: UserTypeDto) {
    return this.usersService.findByUserType(query);
  }

  @Get('detail/:id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put('update/:id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Delete('delete-staff/:id')
  removeStaff(@Param('id') id: string) {
    return this.usersService.deleteStaff(id);
  }
}
