import { clsx } from 'clsx';
import { Bug, CalendarClock, CheckSquare, Sparkles, TrendingUp } from 'lucide-react';
import { dueState, formatDate, priorityLabel, statusLabel, typeLabel } from '@/lib/format';
import type { IssuePriority, IssueStatus, IssueType, Label } from '@/lib/types';

const PRIORITY_LEVEL: Record<IssuePriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const PRIORITY_TEXT: Record<IssuePriority, string> = {
  LOW: 'text-p-low',
  MEDIUM: 'text-p-medium',
  HIGH: 'text-p-high',
  CRITICAL: 'text-p-critical',
};

/** Priority as signal-strength bars: scannable at a glance, readable without colour. */
export function PriorityBars({ priority, withLabel }: { priority: IssuePriority; withLabel?: boolean }) {
  const level = PRIORITY_LEVEL[priority];
  return (
    <span className={clsx('inline-flex items-center gap-1.5', PRIORITY_TEXT[priority])} title={`${priorityLabel[priority]} priority`}>
      <svg viewBox="0 0 14 12" className="h-3 w-3.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 3.6}
            y={9 - i * 3}
            width="2.6"
            height={3 + i * 3}
            rx="0.6"
            fill="currentColor"
            opacity={i < level ? 1 : 0.2}
          />
        ))}
      </svg>
      {withLabel ? (
        <span className="text-[0.8125rem] text-ink-2">{priorityLabel[priority]}</span>
      ) : (
        <span className="sr-only">{priorityLabel[priority]} priority</span>
      )}
    </span>
  );
}

const STATUS_STYLE: Record<IssueStatus, string> = {
  TODO: 'bg-todo/10 text-todo',
  IN_PROGRESS: 'bg-progress/10 text-progress',
  IN_REVIEW: 'bg-review/10 text-review',
  DONE: 'bg-done/10 text-done',
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {statusLabel[status]}
    </span>
  );
}

const TYPE_ICON: Record<IssueType, { Icon: typeof Bug; className: string }> = {
  BUG: { Icon: Bug, className: 'text-danger' },
  FEATURE: { Icon: Sparkles, className: 'text-accent' },
  TASK: { Icon: CheckSquare, className: 'text-progress' },
  IMPROVEMENT: { Icon: TrendingUp, className: 'text-review' },
};

export function TypeIcon({ type, withLabel }: { type: IssueType; withLabel?: boolean }) {
  const { Icon, className } = TYPE_ICON[type];
  return (
    <span className="inline-flex items-center gap-1.5" title={typeLabel[type]}>
      <Icon className={clsx('size-3.5 shrink-0', className)} aria-hidden />
      {withLabel ? <span className="text-[0.8125rem] text-ink-2">{typeLabel[type]}</span> : <span className="sr-only">{typeLabel[type]}</span>}
    </span>
  );
}

export function IssueKey({ value, className }: { value: string; className?: string }) {
  return <span className={clsx('font-mono text-xs tracking-tight text-muted', className)}>{value}</span>;
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-px text-[0.6875rem] text-ink-2">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
      {label.name}
    </span>
  );
}

export function DueDate({ iso, status }: { iso: string | null; status: IssueStatus }) {
  const state = dueState(iso, status);
  if (!iso) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs',
        state === 'overdue' ? 'font-medium text-danger' : state === 'soon' ? 'text-warning' : 'text-muted',
      )}
      title={state === 'overdue' ? 'Overdue' : 'Due date'}
    >
      <CalendarClock className="size-3" aria-hidden />
      {formatDate(iso)}
      {state === 'overdue' && <span className="sr-only">(overdue)</span>}
    </span>
  );
}
