import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { AuthUser } from '../common/types';
import { Paginated, skipTake } from '../common/utils/paginated';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PublicUser, publicUserSelect } from './user.select';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async list(query: ListUsersQueryDto): Promise<Paginated<PublicUser>> {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { username: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: { name: 'asc' },
        ...skipTake(query.page, query.limit),
      }),
      this.prisma.user.count({ where }),
    ]);
    return new Paginated(items, total, query.page, query.limit);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    if (dto.username) {
      const taken = await this.prisma.user.findFirst({
        where: { username: dto.username, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new ConflictException('Username is already taken');
    }
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: publicUserSelect });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS) },
      select: publicUserSelect,
    });
  }

  /** Admin-only: change role or (de)activate an account. */
  async adminUpdate(actor: AuthUser, userId: string, dto: AdminUpdateUserDto): Promise<PublicUser> {
    if (actor.id === userId && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate yourself');
    }
    await this.findById(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: publicUserSelect,
    });
    if (dto.isActive === false) {
      // Deactivated users lose every session immediately.
      await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
    return user;
  }
}
