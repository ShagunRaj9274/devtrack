'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { getAccessToken, refreshSession, SOCKET_URL } from './api';
import { useAuth } from './auth';
import { qk } from './query-keys';
import type { Issue, Notification } from './types';

/** Event names shared with apps/backend/src/realtime/events.ts */
export const WsEvents = {
  JoinProject: 'project:join',
  LeaveProject: 'project:leave',
  IssueCreated: 'issue:created',
  IssueUpdated: 'issue:updated',
  IssueDeleted: 'issue:deleted',
  CommentCreated: 'comment:created',
  CommentUpdated: 'comment:updated',
  CommentDeleted: 'comment:deleted',
  NotificationNew: 'notification:new',
} as const;

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { status, sessionVersion } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const s = io(SOCKET_URL, {
      transports: ['websocket'],
      // A function, so every (re)connect sends the current token.
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    s.on('connect_error', async () => {
      // Usually an expired access token: refresh once and let socket.io retry.
      await refreshSession();
    });
    s.on(WsEvents.NotificationNew, (n: Notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(n.title, { description: n.body ?? undefined });
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [status, sessionVersion, queryClient]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

/**
 * Joins a project's room while mounted and keeps every cached view of that project
 * fresh: lists, board, analytics, activity and any open issue or its comments.
 * Changes made by the current user are already reflected by the mutation itself.
 */
export function useProjectRealtime(projectId: string | undefined, currentUserId?: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !projectId) return;
    const join = () => socket.emit(WsEvents.JoinProject, { projectId });
    if (socket.connected) join();
    socket.on('connect', join); // re-join after reconnects

    const refreshProject = () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    };
    const onIssue = (payload: { issue?: Issue; issueId?: string; actorId: string }) => {
      refreshProject();
      const id = payload.issue?.id ?? payload.issueId;
      if (id) queryClient.invalidateQueries({ queryKey: qk.issue(id) });
      if (payload.actorId !== currentUserId && payload.issue && payload.issue.assigneeId === currentUserId) {
        queryClient.invalidateQueries({ queryKey: qk.myAnalytics });
      }
    };
    const onComment = (payload: { issueId: string }) => {
      queryClient.invalidateQueries({ queryKey: qk.comments(payload.issueId) });
      queryClient.invalidateQueries({ queryKey: qk.activity(payload.issueId) });
      queryClient.invalidateQueries({ queryKey: qk.projectActivity(projectId) });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io listener signature
    const handlers: [string, (...args: any[]) => void][] = [
      [WsEvents.IssueCreated, onIssue],
      [WsEvents.IssueUpdated, onIssue],
      [WsEvents.IssueDeleted, onIssue],
      [WsEvents.CommentCreated, onComment],
      [WsEvents.CommentUpdated, onComment],
      [WsEvents.CommentDeleted, onComment],
    ];
    handlers.forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      socket.off('connect', join);
      handlers.forEach(([event, handler]) => socket.off(event, handler));
      socket.emit(WsEvents.LeaveProject, { projectId });
    };
  }, [socket, projectId, currentUserId, queryClient]);
}
