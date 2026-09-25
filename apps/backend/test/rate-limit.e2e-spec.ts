import { Role } from '@prisma/client';
import type { TestApp } from './helpers';

type Helpers = typeof import('./helpers');

/**
 * Runs with a realistic credential limit (other suites raise it to avoid flakiness).
 * Both tests share one limiter window (same client IP), so their order matters.
 */
describe('Rate limiting (e2e)', () => {
  let t: TestApp;
  let h: Helpers;
  const saved = process.env.AUTH_RATE_LIMIT_PER_MINUTE;

  beforeAll(async () => {
    // ConfigModule snapshots process.env when AppModule is first imported,
    // so load a fresh module graph after changing it.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = '3';
    process.env.TRUST_PROXY = '1';
    jest.resetModules();
    h = await import('./helpers');
    t = await h.bootApp();
  });
  afterAll(async () => {
    await t.app.close();
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = saved;
    delete process.env.TRUST_PROXY;
  });

  it('does not apply the credential limit to normal API use or session refresh', async () => {
    // Regression: @nestjs/throttler applies every named bucket to every route unless
    // skipped, which once capped ALL traffic at the login limit.
    const user = await h.createUser(t.prisma, 'DEVELOPER' as Role);
    const session = await h.login(t, user.email); // 1 of 3 credential attempts

    for (let i = 0; i < 15; i++) {
      await t.http().get('/api/auth/me').set(h.bearer(session)).expect(200);
    }
    let cookie = session.cookie;
    for (let i = 0; i < 6; i++) {
      const res = await t.http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
      cookie = ([] as string[]).concat(res.headers['set-cookie'])[0].split(';')[0];
    }
  });

  it('limits repeated login attempts', async () => {
    const attempt = () =>
      t.http().post('/api/auth/login').send({ email: 'ghost@test.dev', password: 'Wrong1234' });
    await attempt().expect(401); // 2 of 3
    await attempt().expect(401); // 3 of 3
    const blocked = await attempt().expect(429);
    expect(blocked.body.statusCode).toBe(429);
  });

  it('with TRUST_PROXY, limits each real client separately (not everyone behind the proxy together)', async () => {
    // The direct client is blocked by the previous test; another visitor behind the same proxy is not.
    await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'ghost@test.dev', password: 'Wrong1234' })
      .expect(429);
    await t
      .http()
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ email: 'ghost@test.dev', password: 'Wrong1234' })
      .expect(401);
  });
});
