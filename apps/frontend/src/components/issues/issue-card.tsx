import { clsx } from 'clsx';
import { Lock, MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import type { Issue } from '@/lib/types';
import { DueDate, IssueKey, LabelChip, PriorityBars, TypeIcon } from './issue-bits';

/** Presentational board card; drag behaviour is attached by the board. */
export function IssueCard({ issue, locked, dragging, overlay }: { issue: Issue; locked?: boolean; dragging?: boolean; overlay?: boolean }) {
  return (
    <div
      className={clsx(
        'relative rounded-md border bg-surface p-3 text-left',
        overlay ? 'rotate-1 border-accent shadow-lg' : 'border-line hover:border-line-strong',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={issue.type} />
        <IssueKey value={issue.key} />
        {locked && <Lock className="ml-auto size-3 text-muted" aria-label="You can't move this issue" />}
      </div>
      <p className="mt-1.5 line-clamp-3 font-medium leading-snug text-ink">{issue.title}</p>
      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((l) => <LabelChip key={l.id} label={l} />)}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <PriorityBars priority={issue.priority} />
        <DueDate iso={issue.dueDate} status={issue.status} />
        {issue.commentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted" title={`${issue.commentCount} comments`}>
            <MessageSquare className="size-3" aria-hidden /> {issue.commentCount}
          </span>
        )}
        <span className="ml-auto">
          {issue.assignee ? <Avatar user={issue.assignee} size="sm" /> : <span className="block size-6 rounded-full border border-dashed border-line-strong" title="Unassigned" />}
        </span>
      </div>
    </div>
  );
}
