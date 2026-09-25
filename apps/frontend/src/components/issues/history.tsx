'use client';

import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { Activity } from '@/lib/types';
import { describeActivity } from './activity';

export function History({ issueId }: { issueId: string }) {
  const activity = useQuery({ queryKey: qk.activity(issueId), queryFn: () => api<Activity[]>(`/issues/${issueId}/activity`) });
  if (activity.isPending) return <Skeleton className="h-24" />;
  if (activity.isError) return <p className="text-danger">{errorMessage(activity.error)}</p>;
  return (
    <ol className="relative ml-3 border-l border-line">
      {activity.data.map((a) => (
        <li key={a.id} className="relative pb-4 pl-6 last:pb-0">
          <Avatar user={a.actor} size="sm" className="absolute top-0 -left-3 ring-2 ring-surface" />
          <p className="text-[0.8125rem] text-ink-2">
            <span className="font-medium text-ink">{a.actor.name}</span> {describeActivity(a)}
          </p>
          <time dateTime={a.createdAt} className="text-xs text-muted" title={new Date(a.createdAt).toLocaleString()}>
            {timeAgo(a.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
