import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

/** Redis is a cache here: when it fails, requests must still succeed. */
describe('RedisService (failure tolerance)', () => {
  let service: RedisService;
  const failing = () => Promise.reject(new Error('ECONNREFUSED'));

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new RedisService({
      getOrThrow: () => 'redis://127.0.0.1:1',
    } as unknown as ConfigService);
    service.client.disconnect();
    Object.assign(service.client, {
      get: failing,
      set: failing,
      del: failing,
      ping: failing,
      quit: failing,
    });
  });

  it('treats read failures as a cache miss', async () => {
    await expect(service.getJson('k')).resolves.toBeNull();
  });

  it('swallows write and delete failures', async () => {
    await expect(service.setJson('k', { a: 1 }, 10)).resolves.toBeUndefined();
    await expect(service.del('k')).resolves.toBeUndefined();
    await expect(service.del()).resolves.toBeUndefined();
  });

  it('reports unhealthy on ping failure and shuts down cleanly', async () => {
    await expect(service.ping()).resolves.toBe(false);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
