import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';
import { parseRedisUrl } from '../redis/redis-url';

/**
 * Socket.IO adapter backed by Redis pub/sub so events emitted on one API
 * instance reach sockets connected to any other instance.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pub = new Redis(parseRedisUrl(this.redisUrl));
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    for (const client of this.clients) {
      client.on('error', (err) => this.logger.warn(`Socket.IO Redis adapter: ${err.message}`));
    }
    await Promise.all([pub.ping(), sub.ping()]);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
  }
}
