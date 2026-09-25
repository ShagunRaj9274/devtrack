'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Comments } from '@/components/issues/comments';
import { History } from '@/components/issues/history';
import { DueDate, IssueKey, LabelChip, PriorityBars, StatusBadge, TypeIcon } from '@/components/issues/issue-bits';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDate, priorityLabel, statusLabel, timeAgo, typeLabel } from '@/lib/format';
import { useIssue, useProject } from '@/lib/hooks';
import { qk } from '@/lib/query-keys';
import { useProjectRealtime } from '@/lib/socket';
import { PRIORITIES, STATUSES, TYPES, type Issue, type IssueDetail } from '@/lib/types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 py-2">
      <dt className="text-[0.8125rem] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export default function IssuePage() {
  const { issueId } = useParams<{ issueId: string }>();
  const me = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const issue = useIssue(issueId);
  const project = useProject(issue.data?.projectId);
  useProjectRealtime(issue.data?.projectId, me.id);
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const [deleting, setDeleting] = useState(false);

  const patch = useMutation({
    mutationFn: (body: Partial<Record<keyof Issue, unknown>>) => api<Issue>(`/issues/${issueId}`, { method: 'PATCH', body }),
    onSuccess: (updated) => {
      // Keep the permissions block: it isn't part of the PATCH response.
      queryClient.setQueryData<IssueDetail>(qk.issue(issueId), (old) => (old ? { ...old, ...updated } : old));
      queryClient.invalidateQueries({ queryKey: qk.issue(issueId) });
      queryClient.invalidateQueries({ queryKey: qk.activity(issueId) });
      queryClient.invalidateQueries({ queryKey: ['project', updated.projectId] });
      toast.success(`Updated ${updated.key}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/issues/${issueId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`Deleted ${issue.data?.key}`);
      queryClient.invalidateQueries({ queryKey: ['project', issue.data?.projectId] });
      router.replace(`/projects/${issue.data?.projectId}/board`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (issue.isPending) return <PageLoader label="Loading issue" />;
  if (issue.isError) {
    const notFound = issue.error instanceof ApiError && issue.error.status === 404;
    return <ErrorState message={notFound ? 'This issue was deleted or you no longer have access to it.' : errorMessage(issue.error)} onRetry={notFound ? undefined : () => issue.refetch()} />;
  }

  const i = issue.data;
  const { canEdit, canAssignOthers, canSelfAssign, canDelete } = i.permissions;
  const members = project.data?.members.map((m) => m.user) ?? [];
  const busy = patch.isPending;

  return (
    <>
      <nav className="mb-2 flex items-center gap-1 text-xs text-muted">
        <ChevronLeft className="size-3.5" aria-hidden />
        <Link href={`/projects/${i.projectId}/board`} className="hover:text-ink">{project.data?.name ?? 'Project'}</Link>
        <span aria-hidden>/</span>
        <IssueKey value={i.key} />
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <article className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-xl leading-snug font-semibold tracking-tight">{i.title}</h1>
            <div className="flex shrink-0 gap-2">
              {canEdit && (
                <Link href={`/issues/${i.id}/edit`}>
                  <Button size="sm"><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                </Link>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeleting(true)}>
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge status={i.status} />
            <TypeIcon type={i.type} withLabel />
            <PriorityBars priority={i.priority} withLabel />
          </div>

          <section className="mt-6">
            <h2 className="sr-only">Description</h2>
            {i.description ? (
              <p className="max-w-[72ch] leading-relaxed whitespace-pre-wrap text-ink-2">{i.description}</p>
            ) : (
              <p className="text-muted">No description.</p>
            )}
          </section>

          <section className="mt-10">
            <div className="mb-4 flex gap-5 border-b border-line" role="tablist">
              {(['comments', 'history'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={clsx('-mb-px border-b-2 pb-2 font-medium', tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}
                >
                  {t === 'comments' ? `Comments${i.commentCount ? ` (${i.commentCount})` : ''}` : 'History'}
                </button>
              ))}
            </div>
            {tab === 'comments' ? <Comments issue={i} /> : <History issueId={i.id} />}
          </section>
        </article>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <dl className="divide-y divide-line rounded-lg border border-line bg-surface px-4">
            <Row label="Status">
              {canEdit ? (
                <Select value={i.status} disabled={busy} onChange={(e) => patch.mutate({ status: e.target.value })} className="h-8" aria-label="Status">
                  {STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                </Select>
              ) : <StatusBadge status={i.status} />}
            </Row>
            <Row label="Assignee">
              {canAssignOthers ? (
                <Select value={i.assigneeId ?? ''} disabled={busy} onChange={(e) => patch.mutate({ assigneeId: e.target.value || null })} className="h-8" aria-label="Assignee">
                  <option value="">Unassigned</option>
                  {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {i.assignee ? <><Avatar user={i.assignee} size="sm" /><span className="truncate">{i.assignee.name}</span></> : <span className="text-muted">Unassigned</span>}
                  </span>
                  {canSelfAssign && !i.assigneeId && (
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ assigneeId: me.id })} loading={busy}>Assign to me</Button>
                  )}
                  {canSelfAssign && i.assigneeId === me.id && (
                    <Button size="sm" variant="ghost" onClick={() => patch.mutate({ assigneeId: null })} loading={busy}>Unassign</Button>
                  )}
                </div>
              )}
            </Row>
            <Row label="Priority">
              {canEdit ? (
                <Select value={i.priority} disabled={busy} onChange={(e) => patch.mutate({ priority: e.target.value })} className="h-8" aria-label="Priority">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabel[p]}</option>)}
                </Select>
              ) : <PriorityBars priority={i.priority} withLabel />}
            </Row>
            <Row label="Type">
              {canEdit ? (
                <Select value={i.type} disabled={busy} onChange={(e) => patch.mutate({ type: e.target.value })} className="h-8" aria-label="Type">
                  {TYPES.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
                </Select>
              ) : <TypeIcon type={i.type} withLabel />}
            </Row>
            <Row label="Due date">
              {i.dueDate ? <DueDate iso={i.dueDate} status={i.status} /> : <span className="text-muted">None</span>}
            </Row>
            <Row label="Labels">
              {i.labels.length ? <div className="flex flex-wrap gap-1">{i.labels.map((l) => <LabelChip key={l.id} label={l} />)}</div> : <span className="text-muted">None</span>}
            </Row>
            <Row label="Reporter">
              <span className="flex items-center gap-2"><Avatar user={i.reporter} size="sm" /><span className="truncate">{i.reporter.name}</span></span>
            </Row>
            <Row label="Created"><span title={new Date(i.createdAt).toLocaleString()}>{formatDate(i.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span></Row>
            <Row label="Updated"><span title={new Date(i.updatedAt).toLocaleString()}>{timeAgo(i.updatedAt)}</span></Row>
          </dl>
          {!canEdit && me.role !== 'VIEWER' && (
            <p className="mt-2 px-1 text-xs text-muted">You can edit issues assigned to you or that you reported.</p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${i.key}?`}
        description="The issue, its comments and its history are permanently deleted."
        confirmLabel="Delete issue"
      />
    </>
  );
}
