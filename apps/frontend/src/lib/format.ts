import type { IssuePriority, IssueStatus, IssueType, Role } from './types';

export const statusLabel: Record<IssueStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};
export const priorityLabel: Record<IssuePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};
export const typeLabel: Record<IssueType, string> = {
  BUG: 'Bug',
  FEATURE: 'Feature',
  TASK: 'Task',
  IMPROVEMENT: 'Improvement',
};
export const roleLabel: Record<Role, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project manager',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};

// Hex values so charts can use the same palette as the CSS tokens.
export const statusColor: Record<IssueStatus, string> = {
  TODO: '#6b7385',
  IN_PROGRESS: '#1f6fd1',
  IN_REVIEW: '#8a4fd6',
  DONE: '#2b8a3e',
};
export const priorityColor: Record<IssuePriority, string> = {
  LOW: '#8a93a3',
  MEDIUM: '#b58300',
  HIGH: '#dd5a12',
  CRITICAL: '#c4302b',
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

export function timeAgo(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en', sameYear ? opts : { ...opts, year: 'numeric' });
}

/** Due-date state for highlighting: overdue, due within 3 days, or fine. */
export function dueState(iso: string | null, status: IssueStatus): 'overdue' | 'soon' | 'ok' | null {
  if (!iso || status === 'DONE') return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 3 * 86400000) return 'soon';
  return 'ok';
}

/** `<input type="date">` value (YYYY-MM-DD) from an ISO string. */
export const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
