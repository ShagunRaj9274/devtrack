import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { bearer, bootApp, createWorld, TestApp } from './helpers';

describe('Real-time updates (e2e)', () => {
  let t: TestApp;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    t = await bootApp();
    await t.app.listen(0);
    url = `http://127.0.0.1:${(t.app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await t.app.close();
  });

  function connect(token: string): Socket {
    const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return socket;
  }
  const connected = (s: Socket) =>
    new Promise<void>((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
  const nextEvent = <T>(s: Socket, event: string, timeoutMs = 3000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${event}`)), timeoutMs);
      s.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  it('rejects connections without a valid token', async () => {
    await expect(connected(connect('invalid'))).rejects.toThrow('Unauthorized');
    const noAuth = io(url, { transports: ['websocket'], reconnection: false });
    sockets.push(noAuth);
    await expect(connected(noAuth)).rejects.toThrow('Unauthorized');
  });

  it('only lets members join a project room', async () => {
    const w = await createWorld(t);
    const member = connect(w.s.dev.token);
    const outsider = connect(w.s.outsider.token);
    const admin = connect(w.s.admin.token);
    await Promise.all([connected(member), connected(outsider), connected(admin)]);

    expect(await member.emitWithAck('project:join', { projectId: w.project.id })).toEqual({
      ok: true,
    });
    expect(await outsider.emitWithAck('project:join', { projectId: w.project.id })).toEqual({
      ok: false,
    });
    expect(await admin.emitWithAck('project:join', { projectId: w.project.id })).toEqual({
      ok: true,
    });
    expect(await member.emitWithAck('project:join', {})).toEqual({ ok: false });
  });

  it('pushes issue and comment events to project members and notifications to the recipient', async () => {
    const w = await createWorld(t);
    const watcher = connect(w.s.dev2.token);
    const assignee = connect(w.s.dev.token);
    const outsider = connect(w.s.outsider.token);
    await Promise.all([connected(watcher), connected(assignee), connected(outsider)]);
    await watcher.emitWithAck('project:join', { projectId: w.project.id });
    let outsiderGotSomething = false;
    outsider.onAny(() => (outsiderGotSomething = true));

    const created = nextEvent<{ issue: { title: string } }>(watcher, 'issue:created');
    const notified = nextEvent<{ type: string }>(assignee, 'notification:new');
    const issue = (
      await t
        .http()
        .post(`/api/projects/${w.project.id}/issues`)
        .set(bearer(w.s.pm))
        .send({ title: 'Live issue', assigneeId: w.users.dev.id })
        .expect(201)
    ).body.data;
    expect((await created).issue.title).toBe('Live issue');
    expect((await notified).type).toBe('ISSUE_ASSIGNED');

    const updated = nextEvent<{ changes: string[]; issue: { status: string } }>(
      watcher,
      'issue:updated',
    );
    await t
      .http()
      .patch(`/api/issues/${issue.id}/status`)
      .set(bearer(w.s.dev))
      .send({ status: 'IN_REVIEW' })
      .expect(200);
    expect(await updated).toMatchObject({ changes: ['status'], issue: { status: 'IN_REVIEW' } });

    const commented = nextEvent<{ issueId: string }>(watcher, 'comment:created');
    const comment = (
      await t
        .http()
        .post(`/api/issues/${issue.id}/comments`)
        .set(bearer(w.s.dev))
        .send({ body: 'live' })
    ).body.data;
    expect((await commented).issueId).toBe(issue.id);

    const edited = nextEvent<{ comment: { body: string } }>(watcher, 'comment:updated');
    await t
      .http()
      .patch(`/api/comments/${comment.id}`)
      .set(bearer(w.s.dev))
      .send({ body: 'edited' });
    expect((await edited).comment.body).toBe('edited');

    const removed = nextEvent<{ commentId: string }>(watcher, 'comment:deleted');
    await t.http().delete(`/api/comments/${comment.id}`).set(bearer(w.s.dev));
    expect((await removed).commentId).toBe(comment.id);

    const deleted = nextEvent<{ issueId: string }>(watcher, 'issue:deleted');
    await t.http().delete(`/api/issues/${issue.id}`).set(bearer(w.s.pm)).expect(204);
    expect((await deleted).issueId).toBe(issue.id);

    expect(outsiderGotSomething).toBe(false);
  });

  it('stops delivering project events after leaving the room', async () => {
    const w = await createWorld(t);
    const s = connect(w.s.dev.token);
    await connected(s);
    await s.emitWithAck('project:join', { projectId: w.project.id });
    expect(await s.emitWithAck('project:leave', { projectId: w.project.id })).toEqual({ ok: true });
    await t
      .http()
      .post(`/api/projects/${w.project.id}/issues`)
      .set(bearer(w.s.pm))
      .send({ title: 'Quiet' })
      .expect(201);
    await expect(nextEvent(s, 'issue:created', 500)).rejects.toThrow('no issue:created');
  });
});
