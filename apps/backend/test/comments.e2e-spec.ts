import { bearer, bootApp, createWorld, TestApp, waitFor } from './helpers';

describe('Comments (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  async function setup() {
    const w = await createWorld(t);
    const issue = (
      await t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send({ title: 'Discuss me', assigneeId: w.users.dev2.id })
        .expect(201)
    ).body.data;
    const post = (who: keyof typeof w.s, body: string) =>
      t.http().post(`/api/issues/${issue.id}/comments`).set(bearer(w.s[who])).send({ body });
    return { w, issue, post };
  }

  it('members add comments, listed oldest first with author, and recorded in the activity timeline', async () => {
    const { w, issue, post } = await setup();
    const c1 = (await post('dev', '  First!  ').expect(201)).body.data;
    expect(c1).toMatchObject({ body: 'First!', author: { id: w.users.dev.id } });
    await post('pm', 'Second').expect(201);

    const list = await t
      .http()
      .get(`/api/issues/${issue.id}/comments`)
      .set(bearer(w.s.viewer))
      .expect(200);
    expect(list.body.data.map((c: { body: string }) => c.body)).toEqual(['First!', 'Second']);
    expect(list.body.meta.total).toBe(2);

    const activity = (await t.http().get(`/api/issues/${issue.id}/activity`).set(bearer(w.s.pm)))
      .body.data;
    expect(activity.filter((a: { type: string }) => a.type === 'COMMENT_ADDED')).toHaveLength(2);
  });

  it('viewers and non-members cannot comment; empty comments are rejected', async () => {
    const { w, issue, post } = await setup();
    await post('viewer', 'Hello').expect(403);
    await post('outsider', 'Hello').expect(404);
    await post('dev', '   ').expect(400);
    await t.http().get(`/api/issues/${issue.id}/comments`).set(bearer(w.s.outsider)).expect(404);
    await t
      .http()
      .get('/api/issues/00000000-0000-4000-8000-000000000000/comments')
      .set(bearer(w.s.pm))
      .expect(404);
  });

  it('only the author can edit a comment', async () => {
    const { w, post } = await setup();
    const c = (await post('dev', 'Original').expect(201)).body.data;
    await t
      .http()
      .patch(`/api/comments/${c.id}`)
      .set(bearer(w.s.dev2))
      .send({ body: 'Hijack' })
      .expect(403);
    await t
      .http()
      .patch(`/api/comments/${c.id}`)
      .set(bearer(w.s.pm))
      .send({ body: 'Moderated' })
      .expect(403);
    const res = await t
      .http()
      .patch(`/api/comments/${c.id}`)
      .set(bearer(w.s.dev))
      .send({ body: 'Edited' })
      .expect(200);
    expect(res.body.data.body).toBe('Edited');
    await t
      .http()
      .patch('/api/comments/00000000-0000-4000-8000-000000000000')
      .set(bearer(w.s.dev))
      .send({ body: 'x' })
      .expect(404);
  });

  it('authors can delete their comments and managers can moderate; others cannot', async () => {
    const { w, post } = await setup();
    const mine = (await post('dev', 'Mine').expect(201)).body.data;
    const other = (await post('dev2', 'Other').expect(201)).body.data;

    await t.http().delete(`/api/comments/${other.id}`).set(bearer(w.s.dev)).expect(403);
    await t.http().delete(`/api/comments/${mine.id}`).set(bearer(w.s.dev)).expect(204);
    await t.http().delete(`/api/comments/${other.id}`).set(bearer(w.s.pm)).expect(204);
    await t.http().delete(`/api/comments/${other.id}`).set(bearer(w.s.pm)).expect(404);
  });

  describe('notifications', () => {
    it('notifies reporter, assignee and earlier commenters, but not the author', async () => {
      const { w, issue, post } = await setup();
      await post('dev', 'Joining the thread').expect(201);
      await waitFor(
        async () =>
          (await t.prisma.notification.count({
            where: { issueId: issue.id, type: 'COMMENT_ADDED' },
          })) === 2,
      );

      await post('pm', 'Reply from the reporter').expect(201);
      await waitFor(
        async () =>
          (await t.prisma.notification.count({
            where: { issueId: issue.id, type: 'COMMENT_ADDED' },
          })) === 4,
      );

      const rows = await t.prisma.notification.findMany({
        where: { issueId: issue.id, type: 'COMMENT_ADDED' },
      });
      const byRecipient = (id: string) => rows.filter((r) => r.recipientId === id).length;
      expect(byRecipient(w.users.pm.id)).toBe(1); // from dev's comment only
      expect(byRecipient(w.users.dev2.id)).toBe(2); // assignee, both comments
      expect(byRecipient(w.users.dev.id)).toBe(1); // earlier commenter, pm's reply
    });

    it('@mentions notify project members once, and ignore non-members', async () => {
      const { w, issue, post } = await setup();
      await post(
        'dev',
        `@${w.users.dev2.username} @${w.users.viewer.username} and @${w.users.outsider.username} please look, @${w.users.dev2.username}`,
      ).expect(201);

      await waitFor(() =>
        t.prisma.notification.findFirst({
          where: { issueId: issue.id, recipientId: w.users.viewer.id },
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      const rows = await t.prisma.notification.findMany({
        where: { issueId: issue.id, type: { in: ['MENTIONED', 'COMMENT_ADDED'] } },
      });

      const forUser = (id: string) => rows.filter((r) => r.recipientId === id).map((r) => r.type);
      expect(forUser(w.users.dev2.id)).toEqual(['MENTIONED']); // assignee + mentioned => one notification
      expect(forUser(w.users.viewer.id)).toEqual(['MENTIONED']);
      expect(forUser(w.users.outsider.id)).toEqual([]);
      expect(forUser(w.users.pm.id)).toEqual(['COMMENT_ADDED']);
    });
  });
});
