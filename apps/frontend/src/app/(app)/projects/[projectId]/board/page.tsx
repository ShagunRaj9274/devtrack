'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IssueCard } from '@/components/issues/issue-card';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { priorityLabel, statusColor, statusLabel } from '@/lib/format';
import { useProject } from '@/lib/hooks';
import { canMoveIssue } from '@/lib/permissions';
import { qk } from '@/lib/query-keys';
import { PRIORITIES, type BoardColumn, type Issue, type IssueStatus } from '@/lib/types';

function DraggableCard({ issue, disabled }: { issue: Issue; disabled: boolean }) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id, data: { issue }, disabled });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Links inside draggables fight with pointer handling, so open on click/Enter instead.
      onClick={() => router.push(`/issues/${issue.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') router.push(`/issues/${issue.id}`);
        listeners?.onKeyDown?.(e);
      }}
      role="button"
      tabIndex={0}
      aria-roledescription={disabled ? undefined : 'Draggable issue. Press space to pick up, arrows to move.'}
      aria-label={`${issue.key}: ${issue.title}`}
      className={clsx('rounded-md outline-offset-2', disabled ? 'cursor-pointer' : 'cursor-grab touch-manipulation active:cursor-grabbing')}
    >
      <IssueCard issue={issue} locked={disabled} dragging={isDragging} />
    </li>
  );
}

function Column({ column, projectId, canCreate, isMovable }: { column: BoardColumn; projectId: string; canCreate: boolean; isMovable: (i: Issue) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const hidden = column.total - column.issues.length;
  return (
    <section
      aria-label={statusLabel[column.status]}
      className="flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-lg bg-sunken/70 sm:w-72 lg:w-auto lg:max-w-none lg:flex-1"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: statusColor[column.status] }} aria-hidden />
        <h2 className="font-semibold">{statusLabel[column.status]}</h2>
        <span className="text-muted tabular-nums">{column.total}</span>
        {canCreate && column.status === 'TODO' && (
          <Link href={`/projects/${projectId}/issues/new`} className="ml-auto rounded p-1 text-muted hover:bg-surface hover:text-ink" aria-label="Create issue">
            <Plus className="size-4" />
          </Link>
        )}
      </header>
      <ul
        ref={setNodeRef}
        className={clsx(
          'flex min-h-32 flex-1 flex-col gap-2 rounded-b-lg px-2 pb-2 transition-colors',
          isOver && 'bg-accent-soft ring-2 ring-accent/40 ring-inset',
        )}
      >
        {column.issues.map((issue) => (
          <DraggableCard key={issue.id} issue={issue} disabled={!isMovable(issue)} />
        ))}
        {column.issues.length === 0 && <li className="grid flex-1 place-items-center py-6 text-xs text-muted">No issues</li>}
        {hidden > 0 && (
          <li className="px-1 pt-1 text-xs text-muted">
            +{hidden} more.{' '}
            <Link href={`/projects/${projectId}/issues?status=${column.status}`} className="font-medium text-accent hover:underline">
              See all in list
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const user = useCurrentUser();
  const project = useProject(projectId).data!;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filters = { search: debounced, assigneeId, priority };
  const key = qk.board(projectId, filters);
  const board = useQuery({
    queryKey: key,
    queryFn: () => api<BoardColumn[]>(`/projects/${projectId}/board`, { query: filters }),
    placeholderData: keepPreviousData,
  });

  const [active, setActive] = useState<Issue | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Press-and-hold on touch so horizontal scrolling between columns still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const move = useMutation({
    mutationFn: ({ issue, status }: { issue: Issue; status: IssueStatus }) =>
      api<Issue>(`/issues/${issue.id}/status`, { method: 'PATCH', body: { status } }),
    // Optimistic: move the card immediately, roll back if the API refuses.
    onMutate: async ({ issue, status }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardColumn[]>(key);
      queryClient.setQueryData<BoardColumn[]>(key, (cols) =>
        cols?.map((c) => {
          if (c.status === issue.status) return { ...c, total: c.total - 1, issues: c.issues.filter((i) => i.id !== issue.id) };
          if (c.status === status) return { ...c, total: c.total + 1, issues: [{ ...issue, status }, ...c.issues] };
          return c;
        }),
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error(errorMessage(err));
    },
    onSuccess: (saved) => toast.success(`${saved.key} moved to ${statusLabel[saved.status]}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }),
  });

  const onDragStart = (e: DragStartEvent) => setActive(e.active.data.current?.issue ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const issue = e.active.data.current?.issue as Issue | undefined;
    const status = e.over?.id as IssueStatus | undefined;
    if (issue && status && status !== issue.status) move.mutate({ issue, status });
  };

  const isMovable = (issue: Issue) => canMoveIssue(user, project, issue);
  const filtered = debounced || assigneeId || priority;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by text or key" className="pl-9" aria-label="Filter issues" />
        </div>
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="w-auto" aria-label="Assignee">
          <option value="">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {project.members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-auto" aria-label="Priority">
          <option value="">Any priority</option>
          {[...PRIORITIES].reverse().map((p) => (
            <option key={p} value={p}>{priorityLabel[p]}</option>
          ))}
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setAssigneeId(''); setPriority(''); }}>
            Clear filters
          </Button>
        )}
        <div className="flex-1" />
        {project.permissions.canCreateIssue && (
          <Link href={`/projects/${projectId}/issues/new`}>
            <Button variant="primary"><Plus className="size-4" aria-hidden /> New issue</Button>
          </Link>
        )}
      </div>

      {board.isError ? (
        <ErrorState message={errorMessage(board.error)} onRetry={() => board.refetch()} />
      ) : !board.data ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0 lg:flex-1" />)}</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          {/* relative: absolutely positioned descendants (sr-only text) must stay inside the scroller */}
          <div className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
            {board.data.map((column) => (
              <Column key={column.status} column={column} projectId={projectId} canCreate={project.permissions.canCreateIssue} isMovable={isMovable} />
            ))}
          </div>
          <DragOverlay>{active && <IssueCard issue={active} overlay />}</DragOverlay>
        </DndContext>
      )}
      {!project.permissions.canManage && user.role !== 'VIEWER' && (
        <p className="mt-2 text-xs text-muted">You can move issues that are assigned to you or that you reported. Locked cards show a padlock.</p>
      )}
      {user.role === 'VIEWER' && <p className="mt-2 text-xs text-muted">Viewers can browse the board but can&apos;t move issues.</p>}
    </>
  );
}
