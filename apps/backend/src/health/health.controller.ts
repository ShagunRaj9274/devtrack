import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({
    summary: 'Liveness of the API, PostgreSQL and Redis (used by Docker healthchecks)',
  })
  async check() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    const status = { status: database && redis ? 'ok' : 'degraded', database, redis };
    if (!database) throw new ServiceUnavailableException(status);
    return status;
  }

  @Public()
  @SkipThrottle()
  @Get('live')
  @ApiOperation({
    summary: 'Process liveness only; touches no database (safe for keep-alive pings)',
  })
  live() {
    return { status: 'ok' };
  }
}
