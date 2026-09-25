import { Prisma } from '@prisma/client';

/** The only user fields ever returned by the API. passwordHash is never selected. */
export const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
  role: true,
  isActive: true,
  avatarColor: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** Compact shape embedded in issues, comments, activity etc. */
export const userSummarySelect = {
  id: true,
  username: true,
  name: true,
  avatarColor: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
