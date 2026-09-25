export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

/** Converts redis://user:pass@host:port/db into the option object ioredis/BullMQ expect. */
export function parseRedisUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  const db =
    parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
