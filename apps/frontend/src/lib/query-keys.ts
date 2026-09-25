/** Central query keys so real-time events can invalidate exactly the right caches. */
export const qk = {
  me: ['me'] as const,
  myAnalytics: ['analytics', 'me'] as const,
  projects: (params?: object) => ['projects', params ?? {}] as const,
  project: (id: string) => ['project', id] as const,
  projectAnalytics: (id: string) => ['project', id, 'analytics'] as const,
  projectActivity: (id: string) => ['project', id, 'activity'] as const,
  issues: (projectId: string, params?: object) => ['project', projectId, 'issues', params ?? {}] as const,
  board: (projectId: string, params?: object) => ['project', projectId, 'board', params ?? {}] as const,
  issue: (id: string) => ['issue', id] as const,
  comments: (issueId: string) => ['issue', issueId, 'comments'] as const,
  activity: (issueId: string) => ['issue', issueId, 'activity'] as const,
  notifications: (params?: object) => ['notifications', params ?? {}] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  users: (params?: object) => ['users', params ?? {}] as const,
};
