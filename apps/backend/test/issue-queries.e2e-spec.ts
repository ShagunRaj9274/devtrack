import { bearer, bootApp, createWorld, TestApp } from './helpers';

/** Search, filtering, sorting, pagination and the board, on one shared dataset. */
describe('Issue queries (e2e)', () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let labelId: string;
  const url = () => `/api/projects/${w.project.id}/issues`;
  const get = (query: string) => t.http().get(`${url()}?${query}`).set(bearer(w.s.dev));
  const keys = (res: { body: { data: { title: string }[] } }) => res.body.data.map((i) => i.title);

  beforeAll(async () => {
    t = await bootApp();
    w = await createWorld(t);
    labelId = (
      await t
        .http()
        .post(`/api/projects/${w.project.id}/labels`)
        .set(bearer(w.s.pm))
        .send({ name: 'ui' })
    ).body.data.id;

    const fixtures = [
      {
        title: 'Crash on checkout',
        type: 'BUG',
        priority: 'CRITICAL',
        status: 'IN_PROGRESS',
        assigneeId: w.users.dev.id,
        labelIds: [labelId],
        dueDate: '2030-01-01',
      },
      {
        title: 'Add export to CSV',
        type: 'FEATURE',
        priority: 'LOW',
        status: 'TODO',
        description: 'Customers want spreadsheets',
      },
      {
        title: 'Refactor billing module',
        type: 'IMPROVEMENT',
        priority: 'MEDIUM',
        status: 'IN_REVIEW',
        assigneeId: w.users.dev2.id,
      },
      {
        title: 'Typo in footer',
        type: 'BUG',
        priority: 'LOW',
        status: 'DONE',
        assigneeId: w.users.dev.id,
        labelIds: [labelId],
      },
      {
        title: 'Update dependencies',
        type: 'TASK',
        priority: 'HIGH',
        status: 'TODO',
        dueDate: '2029-06-01',
      },
    ];
    for (const f of fixtures) {
      await t.http().post(url()).set(bearer(w.s.pm)).send(f).expect(201);
    }
    // 20 filler issues to exercise pagination.
    for (let i = 1; i <= 20; i++) {
      await t
        .http()
        .post(url())
        .set(bearer(w.s.pm))
        .send({ title: `Filler task ${i}`, priority: 'LOW' })
        .expect(201);
    }
  });
  afterAll(() => t.app.close());

  it('paginates with accurate metadata', async () => {
    const page1 = await get('limit=10&page=1').expect(200);
    expect(page1.body.meta).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
    expect(page1.body.data).toHaveLength(10);
    const page3 = await get('limit=10&page=3').expect(200);
    expect(page3.body.data).toHaveLength(5);
    const beyond = await get('limit=10&page=9').expect(200);
    expect(beyond.body.data).toEqual([]);

    // Pages never overlap even though many rows share the same createdAt/priority.
    const all = new Set<string>();
    for (let p = 1; p <= 3; p++) {
      (await get(`limit=10&page=${p}&sortBy=priority`)).body.data.forEach((i: { id: string }) =>
        all.add(i.id),
      );
    }
    expect(all.size).toBe(25);
  });

  it('rejects invalid pagination and sort parameters', async () => {
    await get('limit=101').expect(400);
    await get('page=0').expect(400);
    await get('sortBy=password').expect(400);
    await get('sortOrder=sideways').expect(400);
    await get('assigneeId=bob').expect(400);
  });

  it('searches title and description case-insensitively', async () => {
    expect(keys(await get('search=CHECKOUT'))).toEqual(['Crash on checkout']);
    expect(keys(await get('search=spreadsheets'))).toEqual(['Add export to CSV']);
    expect((await get('search=nothing-matches-this')).body.meta.total).toBe(0);
  });

  it('finds an issue by its key or number', async () => {
    const byKey = await get(`search=${w.project.key}-3`);
    expect(keys(byKey)).toEqual(['Refactor billing module']);
  });

  it('filters by status, priority and type, accepting comma lists and repeated params', async () => {
    expect(
      keys(await get('status=TODO,IN_PROGRESS&priority=CRITICAL,HIGH&sortBy=priority')),
    ).toEqual(['Crash on checkout', 'Update dependencies']);
    expect(keys(await get('type=BUG&type=IMPROVEMENT&sortBy=title&sortOrder=asc'))).toEqual([
      'Crash on checkout',
      'Refactor billing module',
      'Typo in footer',
    ]);
  });

  it('filters by assignee id, "me" and "unassigned", and by label', async () => {
    expect((await get(`assigneeId=${w.users.dev2.id}`)).body.meta.total).toBe(1);
    expect(keys(await get('assigneeId=me&sortBy=title&sortOrder=asc'))).toEqual([
      'Crash on checkout',
      'Typo in footer',
    ]);
    expect((await get('assigneeId=unassigned')).body.meta.total).toBe(22);
    expect((await get(`labelId=${labelId}`)).body.meta.total).toBe(2);
  });

  it('sorts by due date with empty dates last', async () => {
    const res = await get('sortBy=dueDate&sortOrder=asc&limit=3');
    expect(keys(res).slice(0, 2)).toEqual(['Update dependencies', 'Crash on checkout']);
    expect(res.body.data[2].dueDate).toBeNull();
  });

  it('returns the board grouped by status with true totals', async () => {
    const res = await t
      .http()
      .get(`/api/projects/${w.project.id}/board`)
      .set(bearer(w.s.viewer))
      .expect(200);
    const columns = res.body.data;
    expect(columns.map((c: { status: string }) => c.status)).toEqual([
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
      'DONE',
    ]);
    expect(columns.map((c: { total: number }) => c.total)).toEqual([22, 1, 1, 1]);
    // Highest priority first within a column.
    expect(columns[0].issues[0].title).toBe('Update dependencies');

    const filtered = await t
      .http()
      .get(`/api/projects/${w.project.id}/board?assigneeId=me`)
      .set(bearer(w.s.dev))
      .expect(200);
    expect(filtered.body.data.map((c: { total: number }) => c.total)).toEqual([0, 1, 0, 1]);
  });

  it('is not available to non-members', async () => {
    await t.http().get(url()).set(bearer(w.s.outsider)).expect(404);
    await t.http().get(`/api/projects/${w.project.id}/board`).set(bearer(w.s.outsider)).expect(404);
  });
});
