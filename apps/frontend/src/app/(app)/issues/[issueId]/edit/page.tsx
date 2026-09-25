'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { IssueForm } from '@/components/issues/issue-form';
import { IssueKey } from '@/components/issues/issue-bits';
import { ErrorState, PageLoader } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api';
import { useIssue, useProject } from '@/lib/hooks';

export default function EditIssuePage() {
  const { issueId } = useParams<{ issueId: string }>();
  const issue = useIssue(issueId);
  const project = useProject(issue.data?.projectId);

  if (issue.isPending || (issue.data && project.isPending)) return <PageLoader />;
  if (issue.isError) return <ErrorState message={errorMessage(issue.error)} />;
  if (project.isError) return <ErrorState message={errorMessage(project.error)} />;
  if (!issue.data.permissions.canEdit) {
    return <ErrorState message="You can only edit issues that are assigned to you or that you reported." />;
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/issues/${issueId}`} className="text-xs text-muted hover:text-ink">
        Back to <IssueKey value={issue.data.key} />
      </Link>
      <h1 className="mt-1 mb-5 text-lg font-semibold">Edit issue</h1>
      <div className="rounded-lg border border-line bg-surface p-5">
        <IssueForm project={project.data!} issue={issue.data} />
      </div>
    </div>
  );
}
