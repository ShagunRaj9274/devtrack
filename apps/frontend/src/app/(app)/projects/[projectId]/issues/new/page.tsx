'use client';

import { useParams } from 'next/navigation';
import { IssueForm } from '@/components/issues/issue-form';
import { ErrorState } from '@/components/ui/feedback';
import { useProject } from '@/lib/hooks';

export default function NewIssuePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId).data!;
  if (!project.permissions.canCreateIssue) {
    return <ErrorState message="Your role can view this project but not create issues in it." />;
  }
  return (
    <div className="max-w-3xl">
      <h2 className="mb-5 text-lg font-semibold">New issue</h2>
      <div className="rounded-lg border border-line bg-surface p-5">
        <IssueForm project={project} />
      </div>
    </div>
  );
}
