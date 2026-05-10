import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/core/users/entities/user.entity';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext) {
    try {
      const request = context.switchToHttp().getRequest();

      const authHeader: string = request.headers?.authorization;

      if (!authHeader)
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Token Not Found!',
        });

      const [bearer, token] = authHeader.split(' ');

      if (!bearer)
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Token Not Found!',
        });

      const user = await this.jwtService.verify(token, {
        secret: 'dfresh',
      });

      const userData = await this.userRepository.findOne({
        where: { id: user.id },
      });

      if (!userData)
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'User Not Found',
        });

      request['user'] = userData;

      return true;
    } catch (e) {
      throw e;
    }
  }
}
