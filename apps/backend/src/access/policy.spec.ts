import { Role } from '@prisma/client';
import { Actor, policy } from './policy';

const actor = (role: Role, id = 'me'): Actor => ({ id, role });
const admin = actor(Role.ADMIN);
const pm = actor(Role.PROJECT_MANAGER);
const dev = actor(Role.DEVELOPER);
const viewer = actor(Role.VIEWER);

describe('policy', () => {
  it('only admins and project managers create projects', () => {
    expect([admin, pm, dev, viewer].map(policy.canCreateProject)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('project visibility requires membership except for admins', () => {
    expect(policy.canViewProject(admin, false)).toBe(true);
    for (const a of [pm, dev, viewer]) {
      expect(policy.canViewProject(a, false)).toBe(false);
      expect(policy.canViewProject(a, true)).toBe(true);
    }
  });

  it('project management: admins anywhere, PMs only where they are members', () => {
    expect(policy.canManageProject(admin, false)).toBe(true);
    expect(policy.canManageProject(pm, true)).toBe(true);
    expect(policy.canManageProject(pm, false)).toBe(false);
    expect(policy.canManageProject(dev, true)).toBe(false);
  });

  it('project deletion: admins, or the PM who owns it', () => {
    expect(policy.canDeleteProject(admin, 'someone')).toBe(true);
    expect(policy.canDeleteProject(pm, 'me')).toBe(true);
    expect(policy.canDeleteProject(pm, 'someone')).toBe(false);
    expect(policy.canDeleteProject(dev, 'me')).toBe(false);
  });

  describe('issues', () => {
    const mine = { assigneeId: 'me', reporterId: 'x' };
    const reported = { assigneeId: null, reporterId: 'me' };
    const others = { assigneeId: 'x', reporterId: 'y' };
    const unassigned = { assigneeId: null, reporterId: 'y' };

    it('everyone but viewers can create issues in their projects', () => {
      expect(policy.canCreateIssue(dev, true)).toBe(true);
      expect(policy.canCreateIssue(dev, false)).toBe(false);
      expect(policy.canCreateIssue(viewer, true)).toBe(false);
      expect(policy.canCreateIssue(admin, false)).toBe(true);
    });

    it('developers edit only issues assigned to or reported by them', () => {
      expect(policy.canEditIssue(dev, true, mine)).toBe(true);
      expect(policy.canEditIssue(dev, true, reported)).toBe(true);
      expect(policy.canEditIssue(dev, true, others)).toBe(false);
      expect(policy.canEditIssue(dev, false, mine)).toBe(false);
    });

    it('managers edit any issue in their projects; viewers never edit', () => {
      expect(policy.canEditIssue(pm, true, others)).toBe(true);
      expect(policy.canEditIssue(pm, false, others)).toBe(false);
      expect(policy.canEditIssue(admin, false, others)).toBe(true);
      expect(policy.canEditIssue(viewer, true, mine)).toBe(false);
    });

    it('developers can pick up unassigned issues or drop their own, nothing else', () => {
      expect(policy.canAssignIssue(dev, true, unassigned, 'me')).toBe(true);
      expect(policy.canAssignIssue(dev, true, mine, null)).toBe(true);
      expect(policy.canAssignIssue(dev, true, mine, 'me')).toBe(true);
      expect(policy.canAssignIssue(dev, true, unassigned, 'x')).toBe(false);
      expect(policy.canAssignIssue(dev, true, others, 'me')).toBe(false);
      expect(policy.canAssignIssue(dev, true, others, null)).toBe(false);
      expect(policy.canAssignIssue(dev, false, unassigned, 'me')).toBe(false);
    });

    it('managers assign anyone; viewers nobody', () => {
      expect(policy.canAssignIssue(pm, true, others, 'z')).toBe(true);
      expect(policy.canAssignIssue(pm, false, others, 'z')).toBe(false);
      expect(policy.canAssignIssue(admin, false, others, 'z')).toBe(true);
      expect(policy.canAssignIssue(viewer, true, unassigned, 'me')).toBe(false);
      expect(policy.canAssignAnyone(pm, true)).toBe(true);
      expect(policy.canAssignAnyone(dev, true)).toBe(false);
    });

    it('initial assignee for developers must be themselves or nobody', () => {
      expect(policy.canSetInitialAssignee(dev, null)).toBe(true);
      expect(policy.canSetInitialAssignee(dev, 'me')).toBe(true);
      expect(policy.canSetInitialAssignee(dev, 'x')).toBe(false);
      expect(policy.canSetInitialAssignee(pm, 'x')).toBe(true);
    });

    it('only managers delete issues', () => {
      expect([admin, pm, dev, viewer].map((a) => policy.canDeleteIssue(a, true))).toEqual([
        true,
        true,
        false,
        false,
      ]);
      expect(policy.canDeleteIssue(pm, false)).toBe(false);
    });
  });

  describe('comments', () => {
    it('viewers cannot comment; members can', () => {
      expect(policy.canComment(viewer, true)).toBe(false);
      expect(policy.canComment(dev, true)).toBe(true);
      expect(policy.canComment(dev, false)).toBe(false);
      expect(policy.canComment(admin, false)).toBe(true);
    });

    it('only the author edits; authors and managers delete', () => {
      expect(policy.canEditComment(dev, { authorId: 'me' })).toBe(true);
      expect(policy.canEditComment(pm, { authorId: 'x' })).toBe(false);
      expect(policy.canDeleteComment(dev, true, { authorId: 'me' })).toBe(true);
      expect(policy.canDeleteComment(dev, true, { authorId: 'x' })).toBe(false);
      expect(policy.canDeleteComment(pm, true, { authorId: 'x' })).toBe(true);
      expect(policy.canDeleteComment(pm, false, { authorId: 'x' })).toBe(false);
      expect(policy.canDeleteComment(admin, false, { authorId: 'x' })).toBe(true);
    });
  });

  it('only managers manage labels', () => {
    expect(policy.canManageLabels(pm, true)).toBe(true);
    expect(policy.canManageLabels(dev, true)).toBe(false);
  });
});
