'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderKanban, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { ProjectFormDialog, projectStatusLabel } from '@/components/projects/project-form';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { apiPage, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { ProjectListItem } from '@/lib/types';

export default function ProjectsPage() {
  const user = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = { search: debounced, page, limit: 12 };
  const projects = useQuery({
    queryKey: qk.projects(params),
    queryFn: () => apiPage<ProjectListItem>('/projects', params),
    placeholderData: keepPreviousData,
  });
  const canCreate = user.role === 'ADMIN' || user.role === 'PROJECT_MANAGER';

  return (
    <>
      <PageHeader
        title="Projects"
        description={user.role === 'ADMIN' ? 'All projects in DevTrack.' : 'Projects you are a member of.'}
        actions={canCreate && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New project
          </Button>
        )}
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or key" className="pl-9" aria-label="Search projects" />
      </div>

      {projects.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : projects.isError ? (
        <ErrorState message={errorMessage(projects.error)} onRetry={() => projects.refetch()} />
      ) : projects.data.data.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-6" />}
          title={debounced ? 'No projects match your search' : 'No projects yet'}
          description={debounced ? 'Try a different name or key.' : canCreate ? 'Create a project to start tracking issues.' : 'A project manager needs to add you to a project.'}
          action={canCreate && !debounced && <Button variant="primary" onClick={() => setCreating(true)}>New project</Button>}
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.data.map((p) => {
              const done = p.issueCount - p.openIssueCount;
              const pct = p.issueCount ? Math.round((done / p.issueCount) * 100) : 0;
              return (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted">{p.key}</p>
                        <p className="truncate font-semibold">{p.name}</p>
                      </div>
                      {p.status !== 'ACTIVE' && (
                        <span className="rounded bg-sunken px-1.5 py-0.5 text-[0.6875rem] text-muted">{projectStatusLabel[p.status]}</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 flex-1 text-[0.8125rem] text-muted">{p.description || 'No description'}</p>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-muted">
                        <span>{p.openIssueCount} open of {p.issueCount}</span>
                        <span>{pct}% done</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Completed issues">
                        <div className="h-full rounded-full bg-done" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted">
                      <span className="flex items-center gap-1.5">
                        <Avatar user={p.owner} size="sm" /> {p.memberCount} member{p.memberCount === 1 ? '' : 's'}
                      </span>
                      <span>Updated {timeAgo(p.updatedAt)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination meta={projects.data.meta} onPage={setPage} />
        </>
      )}
      <ProjectFormDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
