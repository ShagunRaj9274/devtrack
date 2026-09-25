import { bearer, bootApp, createWorld, TestApp, waitFor } from './helpers';

type World = Awaited<ReturnType<typeof createWorld>>;

describe('Issues (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  const createIssue = (w: World, who: keyof World['s'], body: Record<string, unknown>) =>
    t.http().post(`/api/projects/${w.project.id}/issues`).set(bearer(w.s[who])).send(body);

  describe('create', () => {
    it('creates an issue with sequential keys, reporter, labels and an ISSUE_CREATED activity', async () => {
      const w = await createWorld(t);
      const label = (
        await t
          .http()
          .post(`/api/projects/${w.project.id}/labels`)
          .set(bearer(w.s.pm))
          .send({ name: 'bug' })
      ).body.data;

      const first = (await createIssue(w, 'pm', { title: 'First' }).expect(201)).body.data;
      const second = (
        await createIssue(w, 'pm', {
          title: 'Second',
          type: 'BUG',
          priority: 'CRITICAL',
          dueDate: '2030-01-15',
          assigneeId: w.users.dev.id,
          labelIds: [label.id],
        }).expect(201)
      ).body.data;

      expect(first).toMatchObject({
        key: `${w.project.key}-1`,
        status: 'TODO',
        priority: 'MEDIUM',
        type: 'TASK',
      });
      expect(second).toMatchObject({
        key: `${w.project.key}-2`,
        type: 'BUG',
        priority: 'CRITICAL',
        reporter: { id: w.users.pm.id },
        assignee: { id: w.users.dev.id },
        labels: [{ name: 'bug' }],
      });
      expect(second.reporter.passwordHash).toBeUndefined();

      const activity = await t
        .http()
        .get(`/api/issues/${first.id}/activity`)
        .set(bearer(w.s.viewer))
        .expect(200);
      expect(activity.body.data.map((a: { type: string }) => a.type)).toEqual(['ISSUE_CREATED']);
    });

    it('notifies the assignee', async () => {
      const w = await createWorld(t);
      const issue = (
        await createIssue(w, 'pm', {
          title: 'Assigned at birth',
          assigneeId: w.users.dev.id,
        }).expect(201)
      ).body.data;
      const n = await waitFor(() =>
        t.prisma.notification.findFirst({
          where: { recipientId: w.users.dev.id, issueId: issue.id },
        }),
      );
      expect(n.type).toBe('ISSUE_ASSIGNED');
      expect(n.title).toContain(issue.key);
    });

    it('developers can create issues but only assign them to themselves', async () => {
      const w = await createWorld(t);
      await createIssue(w, 'dev', { title: 'Mine', assigneeId: w.users.dev.id }).expect(201);
      await createIssue(w, 'dev', { title: 'Unassigned' }).expect(201);
      await createIssue(w, 'dev', {
        title: 'For someone else',
        assigneeId: w.users.dev2.id,
      }).expect(403);
    });

    it('viewers and non-members cannot create issues', async () => {
      const w = await createWorld(t);
      await createIssue(w, 'viewer', { title: 'Nope' }).expect(403);
      await createIssue(w, 'outsider', { title: 'Nope' }).expect(404);
    });

    it('rejects assignees who are not members and labels from other projects', async () => {
      const w = await createWorld(t);
      await createIssue(w, 'pm', { title: 'Bad assignee', assigneeId: w.users.outsider.id }).expect(
        400,
      );
      const other = (
        await t
          .http()
          .post('/api/projects')
          .set(bearer(w.s.pm))
          .send({ name: 'Other', key: `O${w.project.key}` })
      ).body.data;
      const foreign = (
        await t
          .http()
          .post(`/api/projects/${other.id}/labels`)
          .set(bearer(w.s.pm))
          .send({ name: 'x' })
      ).body.data;
      await createIssue(w, 'pm', { title: 'Bad label', labelIds: [foreign.id] }).expect(400);
    });

    it('validates the payload', async () => {
      const w = await createWorld(t);
      await createIssue(w, 'pm', { title: 'ab' }).expect(400);
      await createIssue(w, 'pm', { title: 'Valid title', priority: 'URGENT' }).expect(400);
      await createIssue(w, 'pm', { title: 'Valid title', dueDate: 'tomorrow' }).expect(400);
      await createIssue(w, 'pm', { title: 'Valid title', reporterId: w.users.dev.id }).expect(400);
    });
  });

  describe('read', () => {
    it('returns details with permissions tailored to the caller', async () => {
      const w = await createWorld(t);
      const issue = (await createIssue(w, 'pm', { title: 'Perms' }).expect(201)).body.data;

      const dev = (await t.http().get(`/api/issues/${issue.id}`).set(bearer(w.s.dev)).expect(200))
        .body.data;
      expect(dev.permissions).toEqual({
        canEdit: false,
        canAssignOthers: false,
        canSelfAssign: true,
        canDelete: false,
        canComment: true,
      });
      const pm = (await t.http().get(`/api/issues/${issue.id}`).set(bearer(w.s.pm)).expect(200))
        .body.data;
      expect(pm.permissions).toMatchObject({
        canEdit: true,
        canAssignOthers: true,
        canDelete: true,
      });
      const viewer = (
        await t.http().get(`/api/issues/${issue.id}`).set(bearer(w.s.viewer)).expect(200)
      ).body.data;
      expect(viewer.permissions).toEqual({
        canEdit: false,
        canAssignOthers: false,
        canSelfAssign: false,
        canDelete: false,
        canComment: false,
      });

      await t.http().get(`/api/issues/${issue.id}`).set(bearer(w.s.outsider)).expect(404);
      await t
        .http()
        .get('/api/issues/00000000-0000-4000-8000-000000000000')
        .set(bearer(w.s.pm))
        .expect(404);
    });
  });

  describe('update & status', () => {
    it('records one activity per changed field and ignores unchanged fields', async () => {
      const w = await createWorld(t);
      const issue = (await createIssue(w, 'pm', { title: 'Original', priority: 'LOW' }).expect(201))
        .body.data;

      const res = await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({
          title: 'Renamed',
          priority: 'HIGH',
          status: 'TODO',
          description: 'Details',
          dueDate: '2031-05-01',
          assigneeId: w.users.dev2.id,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        title: 'Renamed',
        priority: 'HIGH',
        assignee: { id: w.users.dev2.id },
      });

      const activity = (await t.http().get(`/api/issues/${issue.id}/activity`).set(bearer(w.s.pm)))
        .body.data;
      const types = activity.map((a: { type: string }) => a.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'TITLE_CHANGED',
          'PRIORITY_CHANGED',
          'DESCRIPTION_CHANGED',
          'DUE_DATE_CHANGED',
          'ASSIGNEE_CHANGED',
        ]),
      );
      expect(types).not.toContain('STATUS_CHANGED'); // status was already TODO
      expect(activity.find((a: { type: string }) => a.type === 'PRIORITY_CHANGED').meta).toEqual({
        from: 'LOW',
        to: 'HIGH',
      });
      expect(activity.find((a: { type: string }) => a.type === 'ASSIGNEE_CHANGED').meta.to.id).toBe(
        w.users.dev2.id,
      );

      // Sending identical values is a no-op: no new activity rows.
      await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({ title: 'Renamed', priority: 'HIGH' })
        .expect(200);
      const again = (await t.http().get(`/api/issues/${issue.id}/activity`).set(bearer(w.s.pm)))
        .body.data;
      expect(again).toHaveLength(activity.length);
    });

    it('tracks label additions and removals by name', async () => {
      const w = await createWorld(t);
      const a = (
        await t
          .http()
          .post(`/api/projects/${w.project.id}/labels`)
          .set(bearer(w.s.pm))
          .send({ name: 'alpha' })
      ).body.data;
      const b = (
        await t
          .http()
          .post(`/api/projects/${w.project.id}/labels`)
          .set(bearer(w.s.pm))
          .send({ name: 'beta' })
      ).body.data;
      const issue = (await createIssue(w, 'pm', { title: 'Labels', labelIds: [a.id] }).expect(201))
        .body.data;

      const res = await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({ labelIds: [b.id] })
        .expect(200);
      expect(res.body.data.labels.map((l: { name: string }) => l.name)).toEqual(['beta']);
      const activity = (await t.http().get(`/api/issues/${issue.id}/activity`).set(bearer(w.s.pm)))
        .body.data;
      expect(activity.at(-1)).toMatchObject({
        type: 'LABELS_CHANGED',
        meta: { added: ['beta'], removed: ['alpha'] },
      });

      await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({ dueDate: null, labelIds: [] })
        .expect(200);
    });

    it('developers can move and edit issues assigned to or reported by them, but not others', async () => {
      const w = await createWorld(t);
      const theirs = (
        await createIssue(w, 'pm', { title: 'Assigned to dev', assigneeId: w.users.dev.id }).expect(
          201,
        )
      ).body.data;
      const reported = (await createIssue(w, 'dev', { title: 'Reported by dev' }).expect(201)).body
        .data;
      const someoneElses = (
        await createIssue(w, 'pm', {
          title: 'Assigned to dev2',
          assigneeId: w.users.dev2.id,
        }).expect(201)
      ).body.data;

      const moved = await t
        .http()
        .patch(`/api/issues/${theirs.id}/status`)
        .set(bearer(w.s.dev))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(moved.body.data.status).toBe('IN_PROGRESS');
      await t
        .http()
        .patch(`/api/issues/${reported.id}`)
        .set(bearer(w.s.dev))
        .send({ priority: 'HIGH' })
        .expect(200);

      const denied = await t
        .http()
        .patch(`/api/issues/${someoneElses.id}/status`)
        .set(bearer(w.s.dev))
        .send({ status: 'DONE' })
        .expect(403);
      expect(denied.body.message).toMatch(/assigned to or reported by you/);
      await t
        .http()
        .patch(`/api/issues/${theirs.id}/status`)
        .set(bearer(w.s.dev))
        .send({ status: 'SHIPPED' })
        .expect(400);
    });

    it('developers can pick up unassigned issues and drop their own, but cannot reassign', async () => {
      const w = await createWorld(t);
      const open = (await createIssue(w, 'pm', { title: 'Up for grabs' }).expect(201)).body.data;
      const taken = (
        await createIssue(w, 'pm', { title: 'Taken', assigneeId: w.users.dev2.id }).expect(201)
      ).body.data;

      await t
        .http()
        .patch(`/api/issues/${open.id}`)
        .set(bearer(w.s.dev))
        .send({ assigneeId: w.users.dev.id })
        .expect(200);
      await t
        .http()
        .patch(`/api/issues/${open.id}`)
        .set(bearer(w.s.dev))
        .send({ assigneeId: w.users.dev2.id })
        .expect(403);
      await t
        .http()
        .patch(`/api/issues/${open.id}`)
        .set(bearer(w.s.dev))
        .send({ assigneeId: null })
        .expect(200);
      await t
        .http()
        .patch(`/api/issues/${taken.id}`)
        .set(bearer(w.s.dev))
        .send({ assigneeId: w.users.dev.id })
        .expect(403);
    });

    it('viewers cannot modify issues', async () => {
      const w = await createWorld(t);
      const issue = (await createIssue(w, 'pm', { title: 'Read only' }).expect(201)).body.data;
      const res = await t
        .http()
        .patch(`/api/issues/${issue.id}/status`)
        .set(bearer(w.s.viewer))
        .send({ status: 'DONE' })
        .expect(403);
      expect(res.body.message).toBe('Viewers cannot modify issues');
      await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.viewer))
        .send({ assigneeId: w.users.viewer.id })
        .expect(403);
    });

    it('reassignment notifies the new assignee; other edits notify the current assignee', async () => {
      const w = await createWorld(t);
      const issue = (await createIssue(w, 'pm', { title: 'Notify me' }).expect(201)).body.data;
      await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({ assigneeId: w.users.dev.id })
        .expect(200);
      await waitFor(() =>
        t.prisma.notification.findFirst({
          where: { recipientId: w.users.dev.id, type: 'ISSUE_ASSIGNED', issueId: issue.id },
        }),
      );

      await t
        .http()
        .patch(`/api/issues/${issue.id}`)
        .set(bearer(w.s.pm))
        .send({ priority: 'CRITICAL', status: 'IN_REVIEW' })
        .expect(200);
      const updated = await waitFor(() =>
        t.prisma.notification.findFirst({
          where: { recipientId: w.users.dev.id, type: 'ISSUE_UPDATED', issueId: issue.id },
        }),
      );
      expect(updated.body).toContain('status');
      expect(updated.body).toContain('priority');

      // The assignee changing their own issue doesn't notify themselves.
      await t
        .http()
        .patch(`/api/issues/${issue.id}/status`)
        .set(bearer(w.s.dev))
        .send({ status: 'DONE' })
        .expect(200);
      await new Promise((r) => setTimeout(r, 400));
      expect(
        await t.prisma.notification.count({
          where: { recipientId: w.users.dev.id, type: 'ISSUE_UPDATED' },
        }),
      ).toBe(1);
    });
  });

  describe('delete', () => {
    it('only managers can delete; related rows cascade', async () => {
      const w = await createWorld(t);
      const issue = (
        await createIssue(w, 'dev', { title: 'Delete me', assigneeId: w.users.dev.id }).expect(201)
      ).body.data;
      await t
        .http()
        .post(`/api/issues/${issue.id}/comments`)
        .set(bearer(w.s.dev))
        .send({ body: 'hi' })
        .expect(201);

      await t.http().delete(`/api/issues/${issue.id}`).set(bearer(w.s.dev)).expect(403);
      await t.http().delete(`/api/issues/${issue.id}`).set(bearer(w.s.pm)).expect(204);
      await t.http().get(`/api/issues/${issue.id}`).set(bearer(w.s.pm)).expect(404);
      await t.http().delete(`/api/issues/${issue.id}`).set(bearer(w.s.pm)).expect(404);
      expect(await t.prisma.comment.count({ where: { issueId: issue.id } })).toBe(0);
      expect(await t.prisma.activity.count({ where: { issueId: issue.id } })).toBe(0);
    });

    it('admins can delete issues in projects they are not a member of', async () => {
      const w = await createWorld(t);
      const issue = (await createIssue(w, 'pm', { title: 'Admin cleanup' }).expect(201)).body.data;
      await t.http().delete(`/api/issues/${issue.id}`).set(bearer(w.s.admin)).expect(204);
    });
  });
});
