import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
/** Restricts a route to users whose global role is in the list. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
