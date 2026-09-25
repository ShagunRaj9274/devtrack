import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { bearer, bootApp, createWorld, TestApp } from './helpers';

describe('Notifications (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  async function seed() {
    const w = await createWorld(t);
    const make = (recipientId: string, read = false) => ({
      recipientId,
      actorId: w.users.pm.id,
      type: NotificationType.ISSUE_UPDATED,
      title: 'Something changed',
      readAt: read ? new Date() : null,
    });
    await t.prisma.notification.createMany({
      data: [
        make(w.users.dev.id),
        make(w.users.dev.id),
        make(w.users.dev.id, true),
        make(w.users.dev2.id),
      ],
    });
    return w;
  }

  it('lists only my notifications, newest first, optionally unread only', async () => {
    const w = await seed();
    const all = await t.http().get('/api/notifications').set(bearer(w.s.dev)).expect(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0].actor).toMatchObject({ id: w.users.pm.id });
    const unread = await t
      .http()
      .get('/api/notifications?unread=true')
      .set(bearer(w.s.dev))
      .expect(200);
    expect(unread.body.meta.total).toBe(2);
    const count = await t
      .http()
      .get('/api/notifications/unread-count')
      .set(bearer(w.s.dev))
      .expect(200);
    expect(count.body.data).toEqual({ count: 2 });
  });

  it("marks one as read (idempotent) and cannot touch other users' notifications", async () => {
    const w = await seed();
    const [first] = (await t.http().get('/api/notifications?unread=true').set(bearer(w.s.dev))).body
      .data;
    const res = await t
      .http()
      .patch(`/api/notifications/${first.id}/read`)
      .set(bearer(w.s.dev))
      .expect(200);
    expect(res.body.data).toEqual({ count: 1 });
    await t.http().patch(`/api/notifications/${first.id}/read`).set(bearer(w.s.dev)).expect(200);
    await t.http().patch(`/api/notifications/${first.id}/read`).set(bearer(w.s.dev2)).expect(404);
  });

  it('marks all as read', async () => {
    const w = await seed();
    await t.http().patch('/api/notifications/read-all').set(bearer(w.s.dev)).expect(200);
    const count = await t.http().get('/api/notifications/unread-count').set(bearer(w.s.dev));
    expect(count.body.data.count).toBe(0);
    const other = await t.http().get('/api/notifications/unread-count').set(bearer(w.s.dev2));
    expect(other.body.data.count).toBe(1);
  });

  it('the worker ignores events whose issue or project no longer exists', async () => {
    const service = t.app.get(NotificationsService);
    const w = await createWorld(t);
    const missing = '00000000-0000-4000-8000-000000000000';
    expect(
      await service.handleEvent({
        kind: 'issue.assigned',
        actorId: w.users.pm.id,
        issueId: missing,
        assigneeId: w.users.dev.id,
      }),
    ).toBe(0);
    expect(
      await service.handleEvent({
        kind: 'issue.updated',
        actorId: w.users.pm.id,
        issueId: missing,
        changes: ['status'],
      }),
    ).toBe(0);
    expect(
      await service.handleEvent({
        kind: 'comment.created',
        actorId: w.users.pm.id,
        issueId: missing,
        commentId: missing,
      }),
    ).toBe(0);
    expect(
      await service.handleEvent({
        kind: 'project.member_added',
        actorId: w.users.pm.id,
        projectId: missing,
        userId: w.users.dev.id,
      }),
    ).toBe(0);
  });

  it('an "updated" event for an unassigned issue notifies nobody', async () => {
    const service = t.app.get(NotificationsService);
    const w = await createWorld(t);
    const issue = (
      await t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send({ title: 'Nobody home' })
    ).body.data;
    expect(
      await service.handleEvent({
        kind: 'issue.updated',
        actorId: w.users.pm.id,
        issueId: issue.id,
        changes: ['status'],
      }),
    ).toBe(0);
  });
});
