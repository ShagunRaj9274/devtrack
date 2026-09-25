'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AtSign, Bell, FolderPlus, MessageSquare, RefreshCw, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { api, apiPage, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { Notification, NotificationType } from '@/lib/types';

const ICON: Record<NotificationType, typeof Bell> = {
  ISSUE_ASSIGNED: UserCheck,
  ISSUE_UPDATED: RefreshCw,
  COMMENT_ADDED: MessageSquare,
  MENTIONED: AtSign,
  PROJECT_ADDED: FolderPlus,
};

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const params = { unread: unreadOnly || undefined, page, limit: 20 };

  const list = useQuery({
    queryKey: qk.notifications(params),
    queryFn: () => apiPage<Notification>('/notifications', params),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      refresh();
      toast.success('All notifications marked as read');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.issueId) router.push(`/issues/${n.issueId}`);
    else if (n.projectId) router.push(`/projects/${n.projectId}`);
  };

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        actions={<Button size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>Mark all as read</Button>}
      />
      <div className="mb-3 flex gap-1" role="tablist">
        {[
          { label: 'All', value: false },
          { label: 'Unread', value: true },
        ].map((t) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={unreadOnly === t.value}
            onClick={() => { setUnreadOnly(t.value); setPage(1); }}
            className={clsx('rounded-md px-3 py-1 font-medium', unreadOnly === t.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <div className="flex flex-col gap-1">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : list.data.data.length === 0 ? (
        <EmptyState icon={<Bell className="size-6" />} title={unreadOnly ? "You're all caught up" : 'No notifications yet'} description="You'll hear about assignments, mentions and comments on your issues here." />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {list.data.data.map((n) => {
              const Icon = ICON[n.type];
              return (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-sunken/70', !n.readAt && 'bg-accent-soft/40')}>
                    <Icon className={clsx('mt-0.5 size-4 shrink-0', n.readAt ? 'text-muted' : 'text-accent')} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className={clsx(!n.readAt ? 'font-medium text-ink' : 'text-ink-2')}>{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted">{n.body}</p>}
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {timeAgo(n.createdAt)}
                      {!n.readAt && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination meta={list.data.meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
