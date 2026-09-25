'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { qk } from './query-keys';
import type { IssueDetail, ProjectDetail } from './types';

export const useProject = (projectId: string | undefined) =>
  useQuery({
    queryKey: qk.project(projectId ?? ''),
    queryFn: () => api<ProjectDetail>(`/projects/${projectId}`),
    enabled: !!projectId,
  });

export const useIssue = (issueId: string) =>
  useQuery({ queryKey: qk.issue(issueId), queryFn: () => api<IssueDetail>(`/issues/${issueId}`) });
