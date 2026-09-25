import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import { isAuthRateLimited } from './common/decorators/auth-rate-limit.decorator';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { IssuesModule } from './issues/issues.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RealtimeModule } from './realtime/realtime.module';
import { parseRedisUrl } from './redis/redis-url';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'default', ttl: 60_000, limit: Number(config.get('RATE_LIMIT_PER_MINUTE') ?? 300) },
        // Strict bucket for credential endpoints only (see @AuthRateLimit).
        {
          name: 'auth',
          ttl: 60_000,
          limit: Number(config.get('AUTH_RATE_LIMIT_PER_MINUTE') ?? 10),
          skipIf: (context) => !isAuthRateLimited(context),
        },
      ],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          ...parseRedisUrl(config.getOrThrow<string>('REDIS_URL')),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    AccessModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    IssuesModule,
    CommentsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then check role, then rate limit.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
