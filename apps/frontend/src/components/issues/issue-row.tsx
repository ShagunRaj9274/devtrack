import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { timeAgo } from '@/lib/format';
import type { Issue } from '@/lib/types';
import { DueDate, IssueKey, LabelChip, PriorityBars, StatusBadge, TypeIcon } from './issue-bits';

/** One line in the issue list. Collapses secondary details on small screens. */
export function IssueRow({ issue }: { issue: Issue }) {
  return (
    <li>
      <Link
        href={`/issues/${issue.id}`}
        className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-sunken/70 md:grid-cols-[auto_auto_1fr_auto_auto_auto]"
      >
        <PriorityBars priority={issue.priority} />
        <IssueKey value={issue.key} className="hidden w-16 md:inline" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <TypeIcon type={issue.type} />
            <span className="truncate font-medium text-ink">{issue.title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 md:hidden">
            <IssueKey value={issue.key} />
            <StatusBadge status={issue.status} />
            <DueDate iso={issue.dueDate} status={issue.status} />
          </div>
          {issue.labels.length > 0 && (
            <div className="mt-1 hidden flex-wrap gap-1 md:flex">
              {issue.labels.map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
            </div>
          )}
        </div>
        <span className="hidden md:inline">
          <StatusBadge status={issue.status} />
        </span>
        <span className="hidden w-24 text-right md:inline">
          <DueDate iso={issue.dueDate} status={issue.status} />
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden text-xs text-muted lg:inline">{timeAgo(issue.updatedAt)}</span>
          {issue.assignee ? (
            <Avatar user={issue.assignee} size="sm" />
          ) : (
            <span className="size-6 rounded-full border border-dashed border-line-strong" title="Unassigned" />
          )}
        </span>
      </Link>
    </li>
  );
}
