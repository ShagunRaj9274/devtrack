import { ExecutionContext, SetMetadata } from '@nestjs/common';

const AUTH_RATE_LIMIT = 'devtrack:auth-rate-limit';

/**
 * Opts a route into the strict "auth" throttler bucket (credential guessing targets:
 * login, register, change-password). Every other route is skipped by that bucket;
 * note @nestjs/throttler would otherwise apply every named bucket to every route.
 */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT, true);

export const isAuthRateLimited = (context: ExecutionContext): boolean =>
  Reflect.getMetadata(AUTH_RATE_LIMIT, context.getHandler()) === true;
