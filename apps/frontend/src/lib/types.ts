/** Types mirroring the DevTrack API responses (see apps/backend, Swagger at /api/docs). */
export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER' | 'VIEWER';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED';
export type IssueType = 'BUG' | 'FEATURE' | 'TASK' | 'IMPROVEMENT';
export type IssueStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type IssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type NotificationType = 'ISSUE_ASSIGNED' | 'ISSUE_UPDATED' | 'COMMENT_ADDED' | 'MENTIONED' | 'PROJECT_ADDED';
export type ActivityType =
  | 'ISSUE_CREATED' | 'TITLE_CHANGED' | 'DESCRIPTION_CHANGED' | 'STATUS_CHANGED' | 'PRIORITY_CHANGED'
  | 'TYPE_CHANGED' | 'ASSIGNEE_CHANGED' | 'DUE_DATE_CHANGED' | 'LABELS_CHANGED' | 'COMMENT_ADDED';

export const STATUSES: IssueStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
export const PRIORITIES: IssuePriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const TYPES: IssueType[] = ['BUG', 'FEATURE', 'TASK', 'IMPROVEMENT'];
export const ROLES: Role[] = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'VIEWER'];

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export interface UserSummary {
  id: string;
  username: string;
  name: string;
  avatarColor: string;
}

export interface User extends UserSummary {
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  ownerId: string;
  owner: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListItem extends Project {
  memberCount: number;
  issueCount: number;
  openIssueCount: number;
}

export interface ProjectMember {
  joinedAt: string;
  user: UserSummary & { email: string; role: Role };
}

export interface ProjectDetail extends Project {
  members: ProjectMember[];
  labels: Label[];
  permissions: {
    canManage: boolean;
    canDelete: boolean;
    canCreateIssue: boolean;
    canDeleteIssues: boolean;
    canComment: boolean;
  };
}

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  key: string;
  title: string;
  description: string | null;
  type: IssueType;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  reporterId: string;
  assignee: UserSummary | null;
  reporter: UserSummary;
  dueDate: string | null;
  labels: Label[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDetail extends Issue {
  permissions: {
    canEdit: boolean;
    canAssignOthers: boolean;
    canSelfAssign: boolean;
    canDelete: boolean;
    canComment: boolean;
  };
}

export interface BoardColumn {
  status: IssueStatus;
  total: number;
  issues: Issue[];
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  author: UserSummary;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  issueId: string;
  type: ActivityType;
  meta: Record<string, unknown> | null;
  actor: UserSummary;
  createdAt: string;
}

export interface ProjectActivity extends Activity {
  issue: { id: string; key: string; title: string };
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  issueId: string | null;
  projectId: string | null;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary | null;
}

export interface ProjectAnalytics {
  totals: { total: number; open: number; todo: number; inProgress: number; inReview: number; done: number; overdue: number };
  byStatus: { status: IssueStatus; count: number }[];
  openByPriority: { priority: IssuePriority; count: number }[];
  byType: { type: IssueType; count: number }[];
  byAssignee: { user: UserSummary | null; total: number; open: number }[];
  trend: { date: string; created: number; completed: number }[];
  generatedAt: string;
  cached: boolean;
}

export interface MyAnalytics {
  assignedOpen: number;
  byStatus: { status: IssueStatus; count: number }[];
  overdue: number;
  dueSoon: number;
  projectCount: number;
  focus: (Omit<Issue, 'assignee' | 'reporter' | 'labels' | 'commentCount'> & { projectName: string })[];
}
