import { CanActivate, Injectable } from '@nestjs/common';

@Injectable()
export class UserGuard implements CanActivate {
  canActivate() {
    return true;
  }
}
