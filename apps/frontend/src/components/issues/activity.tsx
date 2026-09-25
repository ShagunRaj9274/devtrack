import { formatDate, priorityLabel, statusLabel, typeLabel } from '@/lib/format';
import type { Activity, IssuePriority, IssueStatus, IssueType } from '@/lib/types';

type Meta = Record<string, unknown>;
const name = (v: unknown) => (v && typeof v === 'object' && 'name' in v ? String((v as { name: string }).name) : null);

/** Human sentence for an activity entry, e.g. "changed status from To do to In progress". */
export function describeActivity(a: Pick<Activity, 'type' | 'meta'>): React.ReactNode {
  const m = (a.meta ?? {}) as Meta;
  const strong = (s: React.ReactNode) => <strong className="font-medium text-ink">{s}</strong>;
  switch (a.type) {
    case 'ISSUE_CREATED':
      return 'created the issue';
    case 'STATUS_CHANGED':
      return <>moved it from {strong(statusLabel[m.from as IssueStatus])} to {strong(statusLabel[m.to as IssueStatus])}</>;
    case 'PRIORITY_CHANGED':
      return <>changed priority from {strong(priorityLabel[m.from as IssuePriority])} to {strong(priorityLabel[m.to as IssuePriority])}</>;
    case 'TYPE_CHANGED':
      return <>changed type from {strong(typeLabel[m.from as IssueType])} to {strong(typeLabel[m.to as IssueType])}</>;
    case 'ASSIGNEE_CHANGED': {
      const to = name(m.to);
      const from = name(m.from);
      if (!to) return <>unassigned {strong(from ?? 'the issue')}</>;
      return from ? <>reassigned from {strong(from)} to {strong(to)}</> : <>assigned it to {strong(to)}</>;
    }
    case 'TITLE_CHANGED':
      return <>renamed it to {strong(`“${String(m.to)}”`)}</>;
    case 'DESCRIPTION_CHANGED':
      return 'updated the description';
    case 'DUE_DATE_CHANGED':
      return m.to ? <>set the due date to {strong(formatDate(String(m.to)))}</> : 'removed the due date';
    case 'LABELS_CHANGED': {
      const added = (m.added as string[]) ?? [];
      const removed = (m.removed as string[]) ?? [];
      return (
        <>
          {added.length > 0 && <>added {strong(added.join(', '))}</>}
          {added.length > 0 && removed.length > 0 && ' and '}
          {removed.length > 0 && <>removed {strong(removed.join(', '))}</>}
          {' '}label{added.length + removed.length === 1 ? '' : 's'}
        </>
      );
    }
    case 'COMMENT_ADDED':
      return 'commented';
  }
}
