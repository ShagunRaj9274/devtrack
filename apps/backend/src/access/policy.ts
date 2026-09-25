import { Role } from '@prisma/client';

/**
 * DevTrack permission rules, in one place.
 *
 * Global role decides *what kind* of actions a user may take; project membership
 * decides *where*. Admins bypass membership. Everyone else must be a member of a
 * project to see anything in it (non-members get 404, so project existence is not leaked).
 *
 *              | view | create issue | edit issue          | assign         | delete issue | comment | manage project
 * ADMIN        |  all |     yes      | yes                 | anyone         | yes          | yes     | yes
 * PROJECT_MGR  | member|    yes      | yes                 | any member     | yes          | yes     | yes (if member)
 * DEVELOPER    | member|    yes      | if assignee/reporter| self only      | no           | yes     | no
 * VIEWER       | member|    no       | no                  | no             | no           | no      | no
 */

export interface Actor {
  id: string;
  role: Role;
}

export interface IssueRef {
  assigneeId: string | null;
  reporterId: string;
}

export interface CommentRef {
  authorId: string;
}

const isAdmin = (a: Actor) => a.role === Role.ADMIN;
const isManager = (a: Actor) => a.role === Role.ADMIN || a.role === Role.PROJECT_MANAGER;

export const policy = {
  canCreateProject: (a: Actor) => isManager(a),

  canViewProject: (a: Actor, isMember: boolean) => isAdmin(a) || isMember,

  canManageProject: (a: Actor, isMember: boolean) =>
    isAdmin(a) || (a.role === Role.PROJECT_MANAGER && isMember),

  canDeleteProject: (a: Actor, ownerId: string) =>
    isAdmin(a) || (a.role === Role.PROJECT_MANAGER && a.id === ownerId),

  canCreateIssue: (a: Actor, isMember: boolean) =>
    a.role !== Role.VIEWER && (isAdmin(a) || isMember),

  /** Title, description, type, priority, status, due date, labels. */
  canEditIssue: (a: Actor, isMember: boolean, issue: IssueRef) => {
    if (isAdmin(a)) return true;
    if (!isMember) return false;
    if (a.role === Role.PROJECT_MANAGER) return true;
    if (a.role === Role.DEVELOPER) return issue.assigneeId === a.id || issue.reporterId === a.id;
    return false;
  },

  /**
   * Managers can assign to any member. Developers can only pick up an unassigned
   * issue for themselves or un-assign themselves from their own issue.
   */
  canAssignIssue: (
    a: Actor,
    isMember: boolean,
    issue: IssueRef,
    targetAssigneeId: string | null,
  ) => {
    if (isAdmin(a)) return true;
    if (!isMember) return false;
    if (a.role === Role.PROJECT_MANAGER) return true;
    if (a.role === Role.DEVELOPER) {
      const pickingUp =
        targetAssigneeId === a.id && (issue.assigneeId === null || issue.assigneeId === a.id);
      const droppingOwn = targetAssigneeId === null && issue.assigneeId === a.id;
      return pickingUp || droppingOwn;
    }
    return false;
  },

  /** Whether the user may assign issues to other people (used to shape the UI). */
  canAssignAnyone: (a: Actor, isMember: boolean) =>
    isAdmin(a) || (a.role === Role.PROJECT_MANAGER && isMember),

  /** Used when creating an issue: developers may only assign new issues to themselves. */
  canSetInitialAssignee: (a: Actor, targetAssigneeId: string | null) =>
    isManager(a) || targetAssigneeId === null || targetAssigneeId === a.id,

  canDeleteIssue: (a: Actor, isMember: boolean) =>
    isAdmin(a) || (a.role === Role.PROJECT_MANAGER && isMember),

  canComment: (a: Actor, isMember: boolean) => a.role !== Role.VIEWER && (isAdmin(a) || isMember),

  canEditComment: (a: Actor, comment: CommentRef) =>
    a.role !== Role.VIEWER && comment.authorId === a.id,

  /** Authors can delete their own comments; managers can moderate. */
  canDeleteComment: (a: Actor, isMember: boolean, comment: CommentRef) =>
    comment.authorId === a.id || isAdmin(a) || (a.role === Role.PROJECT_MANAGER && isMember),

  canManageLabels: (a: Actor, isMember: boolean) =>
    isAdmin(a) || (a.role === Role.PROJECT_MANAGER && isMember),
};
