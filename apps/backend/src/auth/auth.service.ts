import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, publicUserSelect } from '../users/user.select';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export const BCRYPT_ROUNDS = 12;
/** How long an already-rotated refresh token is still honoured (parallel tabs, interrupted loads). */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const AVATAR_COLORS = [
  '#4C6EF5',
  '#12B886',
  '#F76707',
  '#AE3EC9',
  '#1098AD',
  '#E8590C',
  '#5C7CFA',
  '#2B8A3E',
];

/**
 * Short-lived JWT access tokens (sent as Bearer header) plus opaque refresh tokens
 * (httpOnly cookie). Refresh tokens are stored hashed, rotated on every use and
 * revoked on logout and password change.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<Session> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
      select: { email: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email ? 'Email is already registered' : 'Username is already taken',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        // Self-registered accounts start as developers; admins can change roles.
      },
      select: publicUserSelect,
    });
    return this.createSession(user);
  }

  async login(dto: LoginDto): Promise<Session> {
    const record = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Compare against a dummy hash when the user doesn't exist so response
    // timing doesn't reveal which emails are registered.
    const hash = record?.passwordHash ?? (await this.dummyHash());
    const valid = await bcrypt.compare(dto.password, hash);
    if (!record || !valid) throw new UnauthorizedException('Invalid email or password');
    if (!record.isActive) throw new UnauthorizedException('This account has been deactivated');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: record.id },
      select: publicUserSelect,
    });
    return this.createSession(user);
  }

  /** Exchanges a valid refresh token for a new session (rotation). */
  /**
   * Exchanges a refresh token for a new session (rotation).
   *
   * Each token is claimed once, atomically. Presenting an already-rotated token within
   * REFRESH_REUSE_GRACE_MS is expected (two tabs resuming at once, or a page load
   * interrupted before the new cookie arrived) and gets its own fresh session.
   * Reuse after that window is treated as theft: every session of the user is revoked.
   */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { user: { select: { ...publicUserSelect } } },
    });
    const now = new Date();
    if (!stored || stored.expiresAt < now || !stored.user.isActive) {
      if (stored) await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      throw new UnauthorizedException('Session expired, please log in again');
    }

    if (!stored.rotatedAt) {
      // Conditional update = atomic claim. If a parallel request won the race (0 rows),
      // it did so milliseconds ago, which is inside the grace window, so both succeed.
      await this.prisma.refreshToken.updateMany({
        where: { id: stored.id, rotatedAt: null },
        data: { rotatedAt: now },
      });
      return this.createSession(stored.user);
    }

    if (now.getTime() - stored.rotatedAt!.getTime() <= REFRESH_REUSE_GRACE_MS) {
      return this.createSession(stored.user);
    }
    this.logger.warn(
      `Refresh token reuse detected for user ${stored.userId}; revoking all sessions`,
    );
    await this.revokeAllSessions(stored.userId);
    throw new UnauthorizedException('Session expired, please log in again');
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: this.hash(refreshToken) } });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async createSession(user: PublicUser): Promise<Session> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7);
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // Housekeeping: drop this user's expired tokens and rotated ones past the grace window.
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date() } },
          { rotatedAt: { lt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS) } },
        ],
      },
    });
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.hash(refreshToken), expiresAt: refreshExpiresAt },
    });
    // Opportunistic cleanup of this user's expired sessions.
    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    return { user, accessToken, refreshToken, refreshExpiresAt };
  }

  private dummyHashPromise?: Promise<string>;
  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= bcrypt.hash('devtrack-timing-dummy', BCRYPT_ROUNDS);
    return this.dummyHashPromise;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
