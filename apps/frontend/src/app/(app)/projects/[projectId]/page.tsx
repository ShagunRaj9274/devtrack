'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { describeActivity } from '@/components/issues/activity';
import { IssueKey } from '@/components/issues/issue-bits';
import { ChartPanel, PriorityBarsChart, StatusDonut, TrendChart, TypeBars } from '@/components/projects/charts';
import { LabelsPanel } from '@/components/projects/labels';
import { MembersPanel } from '@/components/projects/members';
import { ProjectFormDialog } from '@/components/projects/project-form';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useProject } from '@/lib/hooks';
import { qk } from '@/lib/query-keys';
import type { ProjectActivity, ProjectAnalytics } from '@/lib/types';

function Workload({ rows, projectId }: { rows: ProjectAnalytics['byAssignee']; projectId: string }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.user?.id ?? 'unassigned'}>
          <Link href={`/projects/${projectId}/issues?assigneeId=${r.user?.id ?? 'unassigned'}&status=TODO,IN_PROGRESS,IN_REVIEW`} className="group flex items-center gap-3">
            {r.user ? <Avatar user={r.user} size="sm" /> : <span className="size-6 shrink-0 rounded-full border border-dashed border-line-strong" />}
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-[0.8125rem]">
                <span className="truncate group-hover:underline">{r.user?.name ?? 'Unassigned'}</span>
                <span className="text-muted tabular-nums">{r.open} open · {r.total} total</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(r.open / max) * 100}%` }} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const project = useProject(projectId).data!; // loaded by the layout
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const analytics = useQuery({ queryKey: qk.projectAnalytics(projectId), queryFn: () => api<ProjectAnalytics>(`/projects/${projectId}/analytics`) });
  const activity = useQuery({ queryKey: qk.projectActivity(projectId), queryFn: () => api<ProjectActivity[]>(`/projects/${projectId}/activity`, { query: { limit: 15 } }) });

  const remove = useMutation({
    mutationFn: () => api(`/projects/${projectId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`Deleted ${project.name}`);
      router.replace('/projects');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const a = analytics.data;
  const stats = a
    ? [
        { label: 'Total', value: a.totals.total },
        { label: 'Open', value: a.totals.open },
        { label: 'In progress', value: a.totals.inProgress },
        { label: 'Completed', value: a.totals.done },
        { label: 'Overdue', value: a.totals.overdue, danger: true },
      ]
    : [];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_19rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {project.description && <p className="max-w-3xl text-ink-2">{project.description}</p>}

        {analytics.isError ? (
          <ErrorState message={errorMessage(analytics.error)} onRetry={() => analytics.refetch()} />
        ) : !a ? (
          <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-52" />)}</div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
              {stats.map((s) => (
                <div key={s.label} className="bg-surface px-4 py-3">
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${s.danger && s.value > 0 ? 'text-danger' : ''}`}>{s.value}</dd>
                </div>
              ))}
            </dl>
            {a.totals.total === 0 ? (
              <EmptyState
                title="No issues yet"
                description="Charts appear once the project has issues."
                action={project.permissions.canCreateIssue && <Link href={`/projects/${projectId}/issues/new`}><Button variant="primary">Create the first issue</Button></Link>}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <ChartPanel title="Issues by status"><StatusDonut data={a.byStatus} /></ChartPanel>
                <ChartPanel title="Open issues by priority" description="Done issues are excluded."><PriorityBarsChart data={a.openByPriority} /></ChartPanel>
                <ChartPanel title="Created vs completed" description="Last 14 days"><TrendChart data={a.trend} /></ChartPanel>
                <ChartPanel title="Issues by type"><TypeBars data={a.byType} /></ChartPanel>
                <div className="md:col-span-2">
                  <ChartPanel title="Workload by assignee" description="Open issues per person. Select a person to see their issues.">
                    <Workload rows={a.byAssignee} projectId={projectId} />
                  </ChartPanel>
                </div>
              </div>
            )}
          </>
        )}

        <section className="rounded-lg border border-line bg-surface">
          <h3 className="border-b border-line px-4 py-3 font-medium">Recent activity</h3>
          {activity.isPending ? (
            <div className="p-4"><Skeleton className="h-24" /></div>
          ) : activity.isError ? (
            <p className="p-4 text-danger">{errorMessage(activity.error)}</p>
          ) : activity.data.length === 0 ? (
            <p className="p-4 text-muted">Nothing has happened here yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.data.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Avatar user={item.actor} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1 text-[0.8125rem] text-ink-2">
                    <span className="font-medium text-ink">{item.actor.name}</span> {describeActivity(item)} on{' '}
                    <Link href={`/issues/${item.issue.id}`} className="hover:underline">
                      <IssueKey value={item.issue.key} /> <span className="text-ink">{item.issue.title}</span>
                    </Link>
                  </div>
                  <time dateTime={item.createdAt} className="shrink-0 text-xs text-muted">{timeAgo(item.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        {(project.permissions.canManage || project.permissions.canDelete) && (
          <div className="flex gap-2">
            {project.permissions.canManage && (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden /> Edit project
              </Button>
            )}
            {project.permissions.canDelete && (
              <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleting(true)}>
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </Button>
            )}
          </div>
        )}
        <MembersPanel project={project} />
        <LabelsPanel project={project} />
      </aside>

      <ProjectFormDialog open={editing} onClose={() => setEditing(false)} project={project} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${project.name}?`}
        description="All issues, comments and history in this project are permanently deleted. This cannot be undone."
        confirmLabel="Delete project"
      />
    </div>
  );
}
