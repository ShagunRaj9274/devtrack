import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { AuthRateLimit } from '../common/decorators/auth-rate-limit.decorator';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from '../common/types';
import { ChangePasswordDto } from '../users/dto/change-password.dto';
import { UsersService } from '../users/users.service';
import { AuthService, Session } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './session-cookie';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh cookie and get a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      clearRefreshCookie(res, this.config);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res, this.config);
  }

  @AuthRateLimit()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password; signs out every other session' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const updated = await this.users.changePassword(user.id, dto);
    await this.auth.revokeAllSessions(user.id);
    // Keep the current device signed in with a fresh session.
    return this.respond(res, await this.auth.createSession(updated));
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The currently authenticated user' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.id);
  }

  private respond(res: Response, session: Session) {
    setRefreshCookie(res, this.config, session.refreshToken, session.refreshExpiresAt);
    // The refresh token itself only ever travels in the httpOnly cookie.
    return { user: session.user, accessToken: session.accessToken };
  }
}
