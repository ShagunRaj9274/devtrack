import { Role } from '@prisma/client';
import { bearer, bootApp, createUser, login, TestApp } from './helpers';

describe('Users (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  it('updates my profile and rejects a taken username', async () => {
    const me = await createUser(t.prisma, Role.DEVELOPER);
    const other = await createUser(t.prisma, Role.DEVELOPER);
    const s = await login(t, me.email);

    const res = await t
      .http()
      .patch('/api/users/me')
      .set(bearer(s))
      .send({ name: 'Renamed Person', avatarColor: '#12B886' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Renamed Person', avatarColor: '#12B886' });

    const profile = await t.http().get('/api/users/me').set(bearer(s)).expect(200);
    expect(profile.body.data.name).toBe('Renamed Person');

    await t
      .http()
      .patch('/api/users/me')
      .set(bearer(s))
      .send({ username: other.username })
      .expect(409);
    await t.http().patch('/api/users/me').set(bearer(s)).send({ role: 'ADMIN' }).expect(400);
  });

  it('only admins and project managers can browse the user directory', async () => {
    const pm = await login(t, (await createUser(t.prisma, Role.PROJECT_MANAGER)).email);
    const dev = await login(t, (await createUser(t.prisma, Role.DEVELOPER)).email);
    const target = await createUser(t.prisma, Role.DEVELOPER, 'findableperson');

    const res = await t.http().get('/api/users?search=findable').set(bearer(pm)).expect(200);
    expect(res.body.data.map((u: { id: string }) => u.id)).toEqual([target.id]);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
    expect(res.body.data[0].passwordHash).toBeUndefined();
    await t.http().get('/api/users').set(bearer(dev)).expect(403);
  });

  it('admins can change roles and deactivate users, but not themselves', async () => {
    const admin = await createUser(t.prisma, Role.ADMIN);
    const s = await login(t, admin.email);
    const target = await createUser(t.prisma, Role.DEVELOPER);
    const targetSession = await login(t, target.email);

    const res = await t
      .http()
      .patch(`/api/users/${target.id}`)
      .set(bearer(s))
      .send({ role: 'PROJECT_MANAGER' })
      .expect(200);
    expect(res.body.data.role).toBe('PROJECT_MANAGER');

    await t
      .http()
      .patch(`/api/users/${target.id}`)
      .set(bearer(s))
      .send({ isActive: false })
      .expect(200);
    // Deactivation kills existing sessions immediately.
    await t.http().post('/api/auth/refresh').set('Cookie', targetSession.cookie).expect(401);

    await t
      .http()
      .patch(`/api/users/${admin.id}`)
      .set(bearer(s))
      .send({ role: 'VIEWER' })
      .expect(400);
    await t
      .http()
      .patch('/api/users/00000000-0000-4000-8000-000000000000')
      .set(bearer(s))
      .send({ role: 'VIEWER' })
      .expect(404);
    await t
      .http()
      .patch(`/api/users/${target.id}`)
      .set(bearer(targetSession))
      .send({ role: 'ADMIN' })
      .expect(401);
  });

  it('non-admins cannot change roles', async () => {
    const pm = await login(t, (await createUser(t.prisma, Role.PROJECT_MANAGER)).email);
    const target = await createUser(t.prisma, Role.DEVELOPER);
    await t
      .http()
      .patch(`/api/users/${target.id}`)
      .set(bearer(pm))
      .send({ role: 'ADMIN' })
      .expect(403);
  });
});
