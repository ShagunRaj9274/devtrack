import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

export const REFRESH_COOKIE = 'dt_refresh';
const COOKIE_PATH = '/api/auth';

export function setRefreshCookie(
  res: Response,
  config: ConfigService,
  token: string,
  expires: Date,
) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE') === 'true',
    sameSite: 'lax',
    path: COOKIE_PATH,
    expires,
  });
}

export function clearRefreshCookie(res: Response, config: ConfigService) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE') === 'true',
    sameSite: 'lax',
    path: COOKIE_PATH,
  });
}
