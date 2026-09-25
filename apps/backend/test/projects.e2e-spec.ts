import { Role } from '@prisma/client';
import { bearer, bootApp, createUser, createWorld, login, TestApp, waitFor } from './helpers';

describe('Projects (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootApp();
  });
  afterAll(() => t.app.close());

  it('project managers and admins can create projects; developers and viewers cannot', async () => {
    const { s } = await createWorld(t);
    const res = await t
      .http()
      .post('/api/projects')
      .set(bearer(s.admin))
      .send({ name: 'Admin Project', key: 'adm', description: 'd' })
      .expect(201);
    expect(res.body.data.key).toBe('ADM'); // normalised

    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.dev))
      .send({ name: 'Nope', key: 'NOPE' })
      .expect(403);
    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.viewer))
      .send({ name: 'Nope', key: 'NOPE' })
      .expect(403);
  });

  it('validates keys and rejects duplicates', async () => {
    const { s } = await createWorld(t);
    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.pm))
      .send({ name: 'Bad', key: '1AB' })
      .expect(400);
    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.pm))
      .send({ name: 'Bad', key: 'A' })
      .expect(400);
    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.pm))
      .send({ name: 'Dup', key: 'DUPE' })
      .expect(201);
    await t
      .http()
      .post('/api/projects')
      .set(bearer(s.pm))
      .send({ name: 'Dup2', key: 'dupe' })
      .expect(409);
  });

  it('lists only projects the user belongs to, with issue counts; admins see all', async () => {
    const { s, project } = await createWorld(t);
    await t
      .http()
      .post(`/api/projects/${project.id}/issues`)
      .set(bearer(s.pm))
      .send({ title: 'Open one' })
      .expect(201);
    await t
      .http()
      .post(`/api/projects/${project.id}/issues`)
      .set(bearer(s.pm))
      .send({ title: 'Done one', status: 'DONE' })
      .expect(201);

    const mine = await t.http().get('/api/projects').set(bearer(s.dev)).expect(200);
    const row = mine.body.data.find((p: { id: string }) => p.id === project.id);
    expect(row).toMatchObject({ issueCount: 2, openIssueCount: 1, memberCount: 4 });

    const outsider = await t.http().get('/api/projects').set(bearer(s.outsider)).expect(200);
    expect(outsider.body.data.find((p: { id: string }) => p.id === project.id)).toBeUndefined();

    const admin = await t
      .http()
      .get(`/api/projects?search=${project.key}`)
      .set(bearer(s.admin))
      .expect(200);
    expect(admin.body.data.map((p: { id: string }) => p.id)).toContain(project.id);
  });

  it('hides projects from non-members with 404 and exposes permissions to members', async () => {
    const { s, project } = await createWorld(t);
    await t.http().get(`/api/projects/${project.id}`).set(bearer(s.outsider)).expect(404);
    await t
      .http()
      .get('/api/projects/00000000-0000-4000-8000-000000000000')
      .set(bearer(s.admin))
      .expect(404);
    await t.http().get('/api/projects/not-a-uuid').set(bearer(s.admin)).expect(400);

    const asDev = await t.http().get(`/api/projects/${project.id}`).set(bearer(s.dev)).expect(200);
    expect(asDev.body.data.permissions).toMatchObject({
      canManage: false,
      canCreateIssue: true,
      canComment: true,
    });
    const asViewer = await t
      .http()
      .get(`/api/projects/${project.id}`)
      .set(bearer(s.viewer))
      .expect(200);
    expect(asViewer.body.data.permissions).toMatchObject({
      canCreateIssue: false,
      canComment: false,
    });
    const asPm = await t.http().get(`/api/projects/${project.id}`).set(bearer(s.pm)).expect(200);
    expect(asPm.body.data.permissions).toMatchObject({ canManage: true, canDelete: true });
    expect(asPm.body.data.members).toHaveLength(4);
  });

  it('only managers can update a project', async () => {
    const { s, project } = await createWorld(t);
    await t
      .http()
      .patch(`/api/projects/${project.id}`)
      .set(bearer(s.dev))
      .send({ name: 'Hacked' })
      .expect(403);
    const res = await t
      .http()
      .patch(`/api/projects/${project.id}`)
      .set(bearer(s.pm))
      .send({ status: 'ON_HOLD' })
      .expect(200);
    expect(res.body.data.status).toBe('ON_HOLD');
    // Key is immutable.
    await t
      .http()
      .patch(`/api/projects/${project.id}`)
      .set(bearer(s.pm))
      .send({ key: 'NEW' })
      .expect(400);
  });

  it('a project manager who is not a member cannot manage the project', async () => {
    const { project } = await createWorld(t);
    const otherPm = await login(t, (await createUser(t.prisma, Role.PROJECT_MANAGER)).email);
    await t
      .http()
      .patch(`/api/projects/${project.id}`)
      .set(bearer(otherPm))
      .send({ name: 'Renamed' })
      .expect(404);
  });

  describe('members', () => {
    it('adds a member and notifies them', async () => {
      const { s, users, project } = await createWorld(t);
      const res = await t
        .http()
        .post(`/api/projects/${project.id}/members`)
        .set(bearer(s.pm))
        .send({ userId: users.outsider.id })
        .expect(201);
      expect(res.body.data.user.id).toBe(users.outsider.id);

      const notification = await waitFor(() =>
        t.prisma.notification.findFirst({
          where: { recipientId: users.outsider.id, type: 'PROJECT_ADDED' },
        }),
      );
      expect(notification.projectId).toBe(project.id);

      await t
        .http()
        .post(`/api/projects/${project.id}/members`)
        .set(bearer(s.pm))
        .send({ userId: users.outsider.id })
        .expect(409);
      await t.http().get(`/api/projects/${project.id}`).set(bearer(s.outsider)).expect(200);
    });

    it('rejects unknown users and non-managers', async () => {
      const { s, users, project } = await createWorld(t);
      await t
        .http()
        .post(`/api/projects/${project.id}/members`)
        .set(bearer(s.pm))
        .send({ userId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
      await t
        .http()
        .post(`/api/projects/${project.id}/members`)
        .set(bearer(s.dev))
        .send({ userId: users.outsider.id })
        .expect(403);
    });

    it('removing a member un-assigns their issues; the owner cannot be removed', async () => {
      const { s, users, project } = await createWorld(t);
      const issue = (
        await t
          .http()
          .post(`/api/projects/${project.id}/issues`)
          .set(bearer(s.pm))
          .send({ title: 'Assigned work', assigneeId: users.dev.id })
          .expect(201)
      ).body.data;

      await t
        .http()
        .delete(`/api/projects/${project.id}/members/${users.dev.id}`)
        .set(bearer(s.pm))
        .expect(204);
      const after = await t.prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
      expect(after.assigneeId).toBeNull();
      await t.http().get(`/api/projects/${project.id}`).set(bearer(s.dev)).expect(404);

      await t
        .http()
        .delete(`/api/projects/${project.id}/members/${users.pm.id}`)
        .set(bearer(s.admin))
        .expect(400);
      await t
        .http()
        .delete(`/api/projects/${project.id}/members/${users.outsider.id}`)
        .set(bearer(s.pm))
        .expect(404);
      const members = await t
        .http()
        .get(`/api/projects/${project.id}/members`)
        .set(bearer(s.viewer))
        .expect(200);
      expect(members.body.data).toHaveLength(3);
    });
  });

  describe('labels', () => {
    it('managers create and delete labels; others cannot', async () => {
      const { s, project } = await createWorld(t);
      const label = (
        await t
          .http()
          .post(`/api/projects/${project.id}/labels`)
          .set(bearer(s.pm))
          .send({ name: 'Frontend', color: '#228BE6' })
          .expect(201)
      ).body.data;
      expect(label.name).toBe('frontend');
      await t
        .http()
        .post(`/api/projects/${project.id}/labels`)
        .set(bearer(s.pm))
        .send({ name: 'frontend' })
        .expect(409);
      await t
        .http()
        .post(`/api/projects/${project.id}/labels`)
        .set(bearer(s.dev))
        .send({ name: 'x' })
        .expect(403);

      const list = await t
        .http()
        .get(`/api/projects/${project.id}/labels`)
        .set(bearer(s.viewer))
        .expect(200);
      expect(list.body.data).toHaveLength(1);

      await t
        .http()
        .delete(`/api/projects/${project.id}/labels/${label.id}`)
        .set(bearer(s.dev))
        .expect(403);
      await t
        .http()
        .delete(`/api/projects/${project.id}/labels/${label.id}`)
        .set(bearer(s.pm))
        .expect(204);
      await t
        .http()
        .delete(`/api/projects/${project.id}/labels/${label.id}`)
        .set(bearer(s.pm))
        .expect(404);
    });
  });

  it('only admins or the owning PM can delete a project', async () => {
    const { s, project } = await createWorld(t);
    await t.http().delete(`/api/projects/${project.id}`).set(bearer(s.dev)).expect(403);
    await t.http().delete(`/api/projects/${project.id}`).set(bearer(s.pm)).expect(204);
    await t.http().get(`/api/projects/${project.id}`).set(bearer(s.admin)).expect(404);
  });
});
