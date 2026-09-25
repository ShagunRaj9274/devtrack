import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisIoAdapter } from '../src/realtime/redis-io.adapter';
import { parseRedisUrl } from '../src/redis/redis-url';
import { TEST_REDIS_URL } from './test-env';

export const PASSWORD = 'Password123';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function bootApp(): Promise<TestApp> {
  // Start every file from an empty Redis DB (cache + queue state).
  const redis = new Redis(parseRedisUrl(TEST_REDIS_URL));
  await redis.flushdb();
  await redis.quit();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  const adapter = new RedisIoAdapter(app, TEST_REDIS_URL, ['http://localhost:3000']);
  await adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);
  await app.init();

  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Notification","Activity","Comment","IssueLabel","Issue","Label",' +
      '"ProjectMember","Project","RefreshToken","User" CASCADE',
  );
}

// Low cost factor keeps tests fast; bcrypt.compare works with any cost.
let passwordHash: string | undefined;
let counter = 0;

export async function createUser(prisma: PrismaService, role: Role, name?: string) {
  passwordHash ??= await bcrypt.hash(PASSWORD, 4);
  const n = ++counter;
  const username = (name ?? `${role.toLowerCase().replace('_', '')}${n}`).toLowerCase();
  return prisma.user.create({
    data: { email: `${username}@test.dev`, username, name: `${username} Test`, role, passwordHash },
  });
}

export interface Session {
  id: string;
  token: string;
  cookie: string;
}

export async function login(t: TestApp, email: string): Promise<Session> {
  const res = await t
    .http()
    .post('/api/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]?.split(';')[0] ?? '';
  return { id: res.body.data.user.id, token: res.body.data.accessToken, cookie };
}

export const bearer = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

/**
 * A project "WEB" owned by a project manager, with a developer, a second developer,
 * a viewer as members, plus an admin and an outsider developer who is NOT a member.
 */
export async function createWorld(t: TestApp) {
  const users = {
    admin: await createUser(t.prisma, Role.ADMIN),
    pm: await createUser(t.prisma, Role.PROJECT_MANAGER),
    dev: await createUser(t.prisma, Role.DEVELOPER),
    dev2: await createUser(t.prisma, Role.DEVELOPER),
    viewer: await createUser(t.prisma, Role.VIEWER),
    outsider: await createUser(t.prisma, Role.DEVELOPER),
  };
  const s = {} as Record<keyof typeof users, Session>;
  for (const [key, user] of Object.entries(users)) {
    s[key as keyof typeof users] = await login(t, user.email);
  }
  const key = `W${(++counter).toString(36).toUpperCase()}`;
  const project = (
    await t.http().post('/api/projects').set(bearer(s.pm)).send({ name: 'Web', key }).expect(201)
  ).body.data;
  await t.prisma.projectMember.createMany({
    data: [users.dev, users.dev2, users.viewer].map((u) => ({
      projectId: project.id,
      userId: u.id,
    })),
  });
  return { users, s, project };
}

export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}
