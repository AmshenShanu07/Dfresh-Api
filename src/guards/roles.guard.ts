import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserTypes } from 'src/common/enums';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';

// Must run after UserAuthGuard (@UseGuards(UserAuthGuard, RolesGuard)) so
// request.user is already populated. A route with no @Roles() metadata is
// unrestricted -- this guard only ever narrows access on routes that opt in.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserTypes[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    return !!user && requiredRoles.includes(user.userType);
  }
}
