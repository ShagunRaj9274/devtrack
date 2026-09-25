'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ListFilter, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { IssueRow } from '@/components/issues/issue-row';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { apiPage, errorMessage } from '@/lib/api';
import { priorityLabel, statusLabel, typeLabel } from '@/lib/format';
import { useProject } from '@/lib/hooks';
import { qk } from '@/lib/query-keys';
import { PRIORITIES, STATUSES, TYPES, type Issue, type IssueStatus } from '@/lib/types';

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest' },
  { value: 'createdAt:asc', label: 'Oldest' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'priority:desc', label: 'Highest priority' },
  { value: 'dueDate:asc', label: 'Due soonest' },
  { value: 'title:asc', label: 'Title A–Z' },
];

function IssueList() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId).data!;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const statuses = (params.get('status')?.split(',').filter(Boolean) ?? []) as IssueStatus[];
  const [sortBy, sortOrder] = (params.get('sort') ?? 'createdAt:desc').split(':');
  const query = {
    search: params.get('search') ?? '',
    status: statuses,
    priority: params.get('priority') ?? '',
    type: params.get('type') ?? '',
    assigneeId: params.get('assigneeId') ?? '',
    labelId: params.get('labelId') ?? '',
    sortBy,
    sortOrder,
    page: Number(params.get('page') ?? 1),
    limit: 25,
  };

  /** Writes filters to the URL (shareable, back-button friendly). Filter changes reset to page 1. */
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // Debounce the search box into the URL.
  const [search, setSearch] = useState(query.search);
  useEffect(() => {
    if (search === query.search) return;
    const t = setTimeout(() => update({ search: search.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const issues = useQuery({
    queryKey: qk.issues(projectId, query),
    queryFn: () => apiPage<Issue>(`/projects/${projectId}/issues`, query),
    placeholderData: keepPreviousData,
  });

  const toggleStatus = (s: IssueStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    update({ status: next.length ? next.join(',') : null });
  };
  const active = query.search || statuses.length || query.priority || query.type || query.assigneeId || query.labelId;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, description or key" className="pl-9" aria-label="Search issues" />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                aria-pressed={statuses.includes(s)}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  statuses.includes(s) ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
                )}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {project.permissions.canCreateIssue && (
            <Link href={`/projects/${projectId}/issues/new`}>
              <Button variant="primary"><Plus className="size-4" aria-hidden /> New issue</Button>
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ListFilter className="size-4 text-muted" aria-hidden />
          <Select value={query.priority} onChange={(e) => update({ priority: e.target.value || null })} className="w-auto" aria-label="Priority">
            <option value="">Any priority</option>
            {[...PRIORITIES].reverse().map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
          </Select>
          <Select value={query.type} onChange={(e) => update({ type: e.target.value || null })} className="w-auto" aria-label="Type">
            <option value="">Any type</option>
            {TYPES.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
          </Select>
          <Select value={query.assigneeId} onChange={(e) => update({ assigneeId: e.target.value || null })} className="w-auto" aria-label="Assignee">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {project.members.map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}
          </Select>
          {project.labels.length > 0 && (
            <Select value={query.labelId} onChange={(e) => update({ labelId: e.target.value || null })} className="w-auto" aria-label="Label">
              <option value="">Any label</option>
              {project.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          )}
          <Select value={`${sortBy}:${sortOrder}`} onChange={(e) => update({ sort: e.target.value === 'createdAt:desc' ? null : e.target.value })} className="w-auto" aria-label="Sort">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          {active && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); router.replace(pathname); }}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {issues.isError ? (
          <ErrorState message={errorMessage(issues.error)} onRetry={() => issues.refetch()} />
        ) : !issues.data ? (
          <div className="flex flex-col gap-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : issues.data.data.length === 0 ? (
          <EmptyState
            title={active ? 'No issues match these filters' : 'No issues yet'}
            description={active ? 'Try removing a filter or searching for something else.' : 'Issues you create will show up here.'}
            action={active ? <Button onClick={() => { setSearch(''); router.replace(pathname); }}>Clear filters</Button> : undefined}
          />
        ) : (
          <div className={clsx('transition-opacity', issues.isPlaceholderData && 'opacity-60')}>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {issues.data.data.map((issue) => <IssueRow key={issue.id} issue={issue} />)}
            </ul>
            <Pagination meta={issues.data.meta} onPage={(p) => update({ page: p > 1 ? String(p) : null })} />
          </div>
        )}
      </div>
    </>
  );
}

export default function IssuesPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<PageLoader />}>
      <IssueList />
    </Suspense>
  );
}
