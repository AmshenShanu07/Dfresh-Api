import { SetMetadata } from '@nestjs/common';
import { UserTypes } from 'src/common/enums';

export const ROLES_KEY = 'roles';

// Marks a route as restricted to the given roles. Routes with no @Roles()
// stay unrestricted (any authenticated non-customer user can reach them) --
// RolesGuard treats missing metadata as "no restriction", so this decorator
// is purely opt-in and never changes behavior on existing routes.
export const Roles = (...roles: UserTypes[]) => SetMetadata(ROLES_KEY, roles);
