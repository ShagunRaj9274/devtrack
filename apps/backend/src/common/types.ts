import { Role } from '@prisma/client';

/** The user attached to every authenticated request (never includes the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string;
  role: Role;
}
