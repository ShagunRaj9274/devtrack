/**
 * Domain events that may produce notifications. Services enqueue these as
 * BullMQ jobs; the worker decides who gets notified. Keeping recipient logic
 * out of the request path keeps writes fast and lets failed jobs retry.
 */
export type NotificationEvent =
  | { kind: 'issue.assigned'; actorId: string; issueId: string; assigneeId: string }
  | { kind: 'issue.updated'; actorId: string; issueId: string; changes: string[] }
  | { kind: 'comment.created'; actorId: string; issueId: string; commentId: string }
  | { kind: 'project.member_added'; actorId: string; projectId: string; userId: string };

export const NOTIFICATIONS_QUEUE = 'notifications';
