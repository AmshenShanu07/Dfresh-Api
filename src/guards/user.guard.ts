import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
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

      const userData = await this.prisma.user.findFirst({
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
