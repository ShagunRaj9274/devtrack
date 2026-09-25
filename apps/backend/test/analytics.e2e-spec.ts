import { bearer, bootApp, createWorld, TestApp } from './helpers';

describe('Analytics & health (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  it('reports health of the database and Redis without authentication', async () => {
    const res = await t.http().get('/api/health').expect(200);
    expect(res.body.data).toEqual({ status: 'ok', database: true, redis: true });
  });

  it('has a public liveness endpoint that does not query the database', async () => {
    const spy = jest.spyOn(t.prisma, '$queryRaw');
    const res = await t.http().get('/api/health/live').expect(200);
    expect(res.body.data).toEqual({ status: 'ok' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('computes project metrics, caches them, and evicts the cache on change', async () => {
    const w = await createWorld(t);
    const create = (body: Record<string, unknown>) =>
      t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send(body)
        .expect(201);
    await create({
      title: 'Bug one',
      type: 'BUG',
      priority: 'CRITICAL',
      assigneeId: w.users.dev.id,
      dueDate: '2020-01-01',
    });
    await create({ title: 'Feature one', type: 'FEATURE', priority: 'LOW', status: 'IN_PROGRESS' });
    const done = (
      await create({
        title: 'Task one',
        type: 'TASK',
        priority: 'HIGH',
        assigneeId: w.users.dev.id,
      })
    ).body.data;
    await t
      .http()
      .patch(`/api/issues/${done.id}/status`)
      .set(bearer(w.s.pm))
      .send({ status: 'DONE' })
      .expect(200);

    const first = (
      await t
        .http()
        .get(`/api/projects/${w.project.id}/analytics`)
        .set(bearer(w.s.viewer))
        .expect(200)
    ).body.data;
    expect(first.cached).toBe(false);
    expect(first.totals).toEqual({
      total: 3,
      open: 2,
      todo: 1,
      inProgress: 1,
      inReview: 0,
      done: 1,
      overdue: 1,
    });
    expect(first.openByPriority).toEqual([
      { priority: 'LOW', count: 1 },
      { priority: 'MEDIUM', count: 0 },
      { priority: 'HIGH', count: 0 },
      { priority: 'CRITICAL', count: 1 },
    ]);
    expect(first.byType.find((r: { type: string }) => r.type === 'BUG').count).toBe(1);
    const devRow = first.byAssignee.find(
      (r: { user: { id: string } | null }) => r.user?.id === w.users.dev.id,
    );
    expect(devRow).toMatchObject({ total: 2, open: 1 });
    expect(first.byAssignee.find((r: { user: unknown }) => r.user === null)).toMatchObject({
      total: 1,
      open: 1,
    });
    expect(first.trend).toHaveLength(14);
    expect(first.trend.at(-1)).toMatchObject({ created: 3, completed: 1 });

    const second = (
      await t.http().get(`/api/projects/${w.project.id}/analytics`).set(bearer(w.s.viewer))
    ).body.data;
    expect(second.cached).toBe(true);

    await create({ title: 'Another' });
    const third = (
      await t.http().get(`/api/projects/${w.project.id}/analytics`).set(bearer(w.s.viewer))
    ).body.data;
    expect(third.cached).toBe(false);
    expect(third.totals.total).toBe(4);
  });

  it('returns recent project activity with issue keys, newest first', async () => {
    const w = await createWorld(t);
    const issue = (
      await t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send({ title: 'Watch me' })
    ).body.data;
    await t
      .http()
      .patch(`/api/issues/${issue.id}/status`)
      .set(bearer(w.s.pm))
      .send({ status: 'IN_PROGRESS' });
    const res = await t
      .http()
      .get(`/api/projects/${w.project.id}/activity?limit=5`)
      .set(bearer(w.s.dev))
      .expect(200);
    expect(res.body.data[0]).toMatchObject({
      type: 'STATUS_CHANGED',
      issue: { key: issue.key },
      actor: { id: w.users.pm.id },
    });
    await t
      .http()
      .get(`/api/projects/${w.project.id}/activity`)
      .set(bearer(w.s.outsider))
      .expect(404);
    await t
      .http()
      .get(`/api/projects/${w.project.id}/analytics`)
      .set(bearer(w.s.outsider))
      .expect(404);
  });

  it('personal dashboard summarises my open work', async () => {
    const w = await createWorld(t);
    const create = (body: Record<string, unknown>) =>
      t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send({ assigneeId: w.users.dev.id, ...body })
        .expect(201);
    await create({ title: 'Overdue', priority: 'LOW', dueDate: '2020-01-01' });
    await create({
      title: 'Urgent',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
    await create({ title: 'Finished', status: 'DONE' });

    const me = (await t.http().get('/api/analytics/me').set(bearer(w.s.dev)).expect(200)).body.data;
    expect(me).toMatchObject({ assignedOpen: 2, overdue: 1, dueSoon: 1, projectCount: 1 });
    expect(me.focus.map((i: { title: string }) => i.title)).toEqual(['Urgent', 'Overdue']);
    expect(me.byStatus.map((s: { status: string }) => s.status)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
    ]);
  });
});
