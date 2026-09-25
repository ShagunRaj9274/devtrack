import { parseRedisUrl } from './redis-url';

describe('parseRedisUrl', () => {
  it('parses host and default port', () => {
    expect(parseRedisUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      username: undefined,
      password: undefined,
      db: undefined,
    });
  });

  it('parses credentials, port, db and TLS', () => {
    expect(parseRedisUrl('rediss://user:p%40ss@cache.internal:6380/2')).toEqual({
      host: 'cache.internal',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      tls: {},
    });
  });
});
