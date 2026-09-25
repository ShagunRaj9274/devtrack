/** Socket.IO event names shared with the frontend (see apps/frontend/src/lib/socket.ts). */
export const WsEvents = {
  // client -> server
  JoinProject: 'project:join',
  LeaveProject: 'project:leave',
  // server -> client (project room)
  IssueCreated: 'issue:created',
  IssueUpdated: 'issue:updated',
  IssueDeleted: 'issue:deleted',
  CommentCreated: 'comment:created',
  CommentUpdated: 'comment:updated',
  CommentDeleted: 'comment:deleted',
  // server -> client (personal room)
  NotificationNew: 'notification:new',
} as const;

export const projectRoom = (projectId: string) => `project:${projectId}`;
export const userRoom = (userId: string) => `user:${userId}`;
