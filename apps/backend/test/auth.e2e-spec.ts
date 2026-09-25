import { Role } from '@prisma/client';
import { bearer, bootApp, createUser, login, PASSWORD, TestApp } from './helpers';

describe('Auth (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  const register = (body: Record<string, unknown>) =>
    t.http().post('/api/auth/register').send(body);

  describe('register', () => {
    it('creates a developer account, returns an access token and sets an httpOnly refresh cookie', async () => {
      const res = await register({
        email: 'New@Example.com ',
        username: 'NewUser',
        name: 'New User',
        password: 'Secret123',
      }).expect(201);

      expect(res.body.data.user).toMatchObject({
        email: 'new@example.com',
        username: 'newuser',
        role: 'DEVELOPER',
      });
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('refresh');
      const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
      expect(cookie).toMatch(/^dt_refresh=/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');
    });

    it('stores a bcrypt hash, never the plain password', async () => {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'new@example.com' } });
      expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(user.passwordHash).not.toContain('Secret123');
    });

    it('rejects duplicate email and username with 409', async () => {
      await register({
        email: 'new@example.com',
        username: 'other',
        name: 'Dup',
        password: 'Secret123',
      }).expect(409);
      const res = await register({
        email: 'other@example.com',
        username: 'newuser',
        name: 'Dup',
        password: 'Secret123',
      }).expect(409);
      expect(res.body.message).toBe('Username is already taken');
    });

    it('validates input and rejects unknown fields (e.g. trying to self-assign a role)', async () => {
      const weak = await register({
        email: 'x@example.com',
        username: 'xx1',
        name: 'X',
        password: 'short',
      }).expect(400);
      expect(weak.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/Password must be/)]),
      );
      await register({
        email: 'y@example.com',
        username: 'yyy',
        name: 'Yan',
        password: 'Secret123',
        role: 'ADMIN',
      }).expect(400);
      await register({
        email: 'not-an-email',
        username: 'zzz',
        name: 'Zed',
        password: 'Secret123',
      }).expect(400);
    });
  });

  describe('login', () => {
    it('logs in with correct credentials', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const res = await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      expect(res.body.data.user.id).toBe(user.id);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const wrong = await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Wrong1234' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'ghost@test.dev', password: 'Wrong1234' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('refuses deactivated accounts', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
    });
  });

  describe('protected routes', () => {
    it('require a valid bearer token', async () => {
      await t.http().get('/api/auth/me').expect(401);
      await t.http().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('/auth/me returns the current user without sensitive fields', async () => {
      const user = await createUser(t.prisma, Role.VIEWER);
      const s = await login(t, user.email);
      const res = await t.http().get('/api/auth/me').set(bearer(s)).expect(200);
      expect(res.body.data).toMatchObject({ id: user.id, role: 'VIEWER' });
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('a token stops working as soon as the account is deactivated', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await t.http().get('/api/users/me').set(bearer(s)).expect(401);
    });
  });

  describe('refresh & logout', () => {
    const cookieOf = (res: { headers: Record<string, unknown> }) =>
      ([] as string[]).concat(res.headers['set-cookie'] as string[])[0].split(';')[0];
    const ageRotation = (userId: string, seconds: number) =>
      t.prisma.refreshToken.updateMany({
        where: { userId, rotatedAt: { not: null } },
        data: { rotatedAt: new Date(Date.now() - seconds * 1000) },
      });

    it('rotates the refresh token on every use', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);

      const first = await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(200);
      expect(first.body.data.accessToken).toEqual(expect.any(String));
      const rotated = cookieOf(first);
      expect(rotated).not.toBe(s.cookie);
      await t.http().post('/api/auth/refresh').set('Cookie', rotated).expect(200);
    });

    it('lets parallel refreshes with the same token all succeed (several tabs resuming at once)', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);

      const results = await Promise.all(
        [1, 2, 3].map(() => t.http().post('/api/auth/refresh').set('Cookie', s.cookie)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      // Every tab ends up with its own working session.
      const cookies = results.map(cookieOf);
      expect(new Set(cookies).size).toBe(3);
      for (const cookie of cookies) {
        await t.http().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
      }
    });

    it('honours a just-rotated token briefly (page load interrupted before the new cookie arrived)', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(200);
      await ageRotation(user.id, 20);
      await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(200);
    });

    it('treats reuse after the grace window as theft and revokes every session', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const stolen = await login(t, user.email);
      const other = await login(t, user.email);
      const legit = cookieOf(
        await t.http().post('/api/auth/refresh').set('Cookie', stolen.cookie).expect(200),
      );
      await ageRotation(user.id, 60);

      await t.http().post('/api/auth/refresh').set('Cookie', stolen.cookie).expect(401);
      await t.http().post('/api/auth/refresh').set('Cookie', legit).expect(401);
      await t.http().post('/api/auth/refresh').set('Cookie', other.cookie).expect(401);
      expect(await t.prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    });

    it('cleans up expired and long-rotated tokens when a new session starts', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(200);
      await ageRotation(user.id, 60);
      await login(t, user.email);
      const rows = await t.prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(rows.every((r) => r.rotatedAt === null)).toBe(true);
      expect(rows).toHaveLength(2);
    });

    it('rejects a missing or expired refresh token', async () => {
      await t.http().post('/api/auth/refresh').expect(401);
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      await t.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(0) },
      });
      await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(401);
    });

    it('logout revokes the session and clears the cookie', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      const res = await t.http().post('/api/auth/logout').set('Cookie', s.cookie).expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'])[0]).toMatch(/dt_refresh=;/);
      await t.http().post('/api/auth/refresh').set('Cookie', s.cookie).expect(401);
      await t.http().post('/api/auth/logout').expect(204); // idempotent
    });
  });

  describe('change password', () => {
    it('requires the current password', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const s = await login(t, user.email);
      await t
        .http()
        .post('/api/auth/change-password')
        .set(bearer(s))
        .send({ currentPassword: 'Wrong1234', newPassword: 'Another123' })
        .expect(401);
      await t
        .http()
        .post('/api/auth/change-password')
        .set(bearer(s))
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
        .expect(400);
    });

    it('changes the password and signs out all other sessions', async () => {
      const user = await createUser(t.prisma, Role.DEVELOPER);
      const laptop = await login(t, user.email);
      const phone = await login(t, user.email);

      const res = await t
        .http()
        .post('/api/auth/change-password')
        .set(bearer(laptop))
        .send({ currentPassword: PASSWORD, newPassword: 'Another123' })
        .expect(200);
      const newCookie = ([] as string[]).concat(res.headers['set-cookie'])[0].split(';')[0];

      await t.http().post('/api/auth/refresh').set('Cookie', phone.cookie).expect(401);
      await t.http().post('/api/auth/refresh').set('Cookie', newCookie).expect(200);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Another123' })
        .expect(200);
    });
  });
});
