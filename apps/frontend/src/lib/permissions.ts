import type { Issue, ProjectDetail, User } from './types';

/**
 * Client-side mirror of the backend policy, used only to hide controls the user
 * can't use (e.g. disabling drag on the board). The API remains the authority.
 */
export function canMoveIssue(user: User, project: ProjectDetail, issue: Pick<Issue, 'assigneeId' | 'reporterId'>) {
  if (project.permissions.canManage) return true;
  if (user.role !== 'DEVELOPER') return false;
  return issue.assigneeId === user.id || issue.reporterId === user.id;
}
