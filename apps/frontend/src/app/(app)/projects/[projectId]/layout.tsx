'use client';

import { clsx } from 'clsx';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { projectStatusLabel } from '@/components/projects/project-form';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { ApiError, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { useProject } from '@/lib/hooks';
import { useProjectRealtime } from '@/lib/socket';

/** Shared header + tabs for every project page, and the live-update subscription. */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const user = useCurrentUser();
  const project = useProject(projectId);
  useProjectRealtime(projectId, user.id);

  if (project.isPending) return <PageLoader label="Loading project" />;
  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.status === 404;
    return (
      <ErrorState
        message={notFound ? 'This project does not exist or you are not a member of it.' : errorMessage(project.error)}
        onRetry={notFound ? undefined : () => project.refetch()}
      />
    );
  }

  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: 'Overview', active: pathname === base },
    { href: `${base}/board`, label: 'Board', active: pathname === `${base}/board` },
    { href: `${base}/issues`, label: 'Issues', active: pathname.startsWith(`${base}/issues`) },
  ];

  return (
    <>
      <div className="mb-6 border-b border-line">
        <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
          <ChevronLeft className="size-3.5" aria-hidden /> Projects
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{project.data.name}</h1>
          <span className="font-mono text-xs text-muted">{project.data.key}</span>
          {project.data.status !== 'ACTIVE' && (
            <span className="rounded bg-sunken px-1.5 py-0.5 text-[0.6875rem] text-muted">{projectStatusLabel[project.data.status]}</span>
          )}
        </div>
        <nav className="-mb-px mt-3 flex gap-5" aria-label="Project sections">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? 'page' : undefined}
              className={clsx(
                'border-b-2 pb-2.5 font-medium transition-colors',
                t.active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </>
  );
}
