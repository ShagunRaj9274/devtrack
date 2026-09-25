'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Link from 'next/link';
import { DueDate, IssueKey, PriorityBars, StatusBadge } from '@/components/issues/issue-bits';
import { PageHeader } from '@/components/layout/app-shell';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { statusLabel } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { MyAnalytics, ProjectListItem } from '@/lib/types';

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={clsx('mt-0.5 text-2xl font-semibold tabular-nums', tone === 'danger' && value > 0 && 'text-danger', tone === 'warning' && value > 0 && 'text-warning')}>
        {value}
      </dd>
    </div>
  );
}

export default function DashboardPage() {
  const user = useCurrentUser();
  const mine = useQuery({ queryKey: qk.myAnalytics, queryFn: () => api<MyAnalytics>('/analytics/me') });
  const projects = useQuery({ queryKey: qk.projects({ limit: 6 }), queryFn: () => apiPage<ProjectListItem>('/projects', { limit: 6 }) });

  return (
    <>
      <PageHeader title={`Good to see you, ${user.name.split(' ')[0]}`} description="Your open work across every project you belong to." />

      {mine.isError ? (
        <ErrorState message={errorMessage(mine.error)} onRetry={() => mine.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*:nth-child(-n+2)]:border-b-0">
          {mine.data ? (
            <>
              <Stat label="Assigned to me" value={mine.data.assignedOpen} />
              <Stat label="Overdue" value={mine.data.overdue} tone="danger" />
              <Stat label="Due in 7 days" value={mine.data.dueSoon} tone="warning" />
              <Stat label="Projects" value={mine.data.projectCount} />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-7 w-10" />
              </div>
            ))
          )}
        </dl>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="focus-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="focus-heading" className="font-semibold">Up next for you</h2>
            {mine.data && (
              <p className="text-xs text-muted">
                {mine.data.byStatus.map((s) => `${s.count} ${statusLabel[s.status].toLowerCase()}`).join(', ')}
              </p>
            )}
          </div>
          {mine.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : mine.data && mine.data.focus.length === 0 ? (
            <EmptyState title="Nothing assigned to you" description="Issues assigned to you show up here, most urgent first." />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {mine.data?.focus.map((issue) => (
                <li key={issue.id}>
                  <Link href={`/issues/${issue.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/70">
                    <PriorityBars priority={issue.priority} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{issue.title}</p>
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <IssueKey value={issue.key} /> {issue.projectName}
                      </p>
                    </div>
                    <DueDate iso={issue.dueDate} status={issue.status} />
                    <span className="hidden sm:inline">
                      <StatusBadge status={issue.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="projects-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="projects-heading" className="font-semibold">Projects</h2>
            <Link href="/projects" className="text-xs font-medium text-accent hover:underline">All projects</Link>
          </div>
          {projects.isPending ? (
            <Skeleton className="h-40" />
          ) : projects.isError ? (
            <ErrorState message={errorMessage(projects.error)} onRetry={() => projects.refetch()} />
          ) : projects.data.data.length === 0 ? (
            <EmptyState title="No projects yet" description="Ask a project manager to add you, or create one." />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {projects.data.data.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken/70">
                    <span className="w-10 font-mono text-xs text-muted">{p.key}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-xs text-muted tabular-nums">{p.openIssueCount} open</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
