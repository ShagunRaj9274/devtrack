import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './auth.service';

/**
 * Validates the Bearer token, then re-reads the user so that role changes and
 * deactivation take effect immediately rather than when the token expires.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, name: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    const { isActive: _isActive, ...authUser } = user;
    return authUser;
  }
}
