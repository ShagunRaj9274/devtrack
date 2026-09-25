'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { priorityLabel, statusLabel, toDateInput, typeLabel } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { PRIORITIES, STATUSES, TYPES, type Issue, type IssueDetail, type ProjectDetail } from '@/lib/types';

// Mirrors the backend DTO rules so most mistakes are caught before a round trip.
const schema = z.object({
  title: z.string().trim().min(3, 'Title needs at least 3 characters').max(200, 'Keep the title under 200 characters'),
  description: z.string().max(20000, 'Description is too long'),
  type: z.enum(['BUG', 'FEATURE', 'TASK', 'IMPROVEMENT']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']),
  assigneeId: z.string(),
  dueDate: z.string(),
  labelIds: z.array(z.string()).max(10, 'Use at most 10 labels'),
});
type FormValues = z.infer<typeof schema>;

export function IssueForm({ project, issue }: { project: ProjectDetail; issue?: IssueDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useCurrentUser();
  const canAssignOthers = issue ? issue.permissions.canAssignOthers : project.permissions.canManage;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: issue?.title ?? '',
      description: issue?.description ?? '',
      type: issue?.type ?? 'TASK',
      priority: issue?.priority ?? 'MEDIUM',
      status: issue?.status ?? 'TODO',
      assigneeId: issue?.assigneeId ?? '',
      dueDate: toDateInput(issue?.dueDate ?? null),
      labelIds: issue?.labels.map((l) => l.id) ?? [],
    },
  });

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        ...values,
        description: values.description || undefined,
        assigneeId: values.assigneeId || null,
        dueDate: values.dueDate || null,
      };
      return issue
        ? api<Issue>(`/issues/${issue.id}`, { method: 'PATCH', body })
        : api<Issue>(`/projects/${project.id}/issues`, { method: 'POST', body });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: qk.issue(saved.id) });
      toast.success(issue ? `Saved ${saved.key}` : `Created ${saved.key}`);
      router.push(`/issues/${saved.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400 && /title/i.test(err.message)) {
        setError('title', { message: err.message });
      } else toast.error(errorMessage(err));
    },
  });

  // Developers may only assign to themselves (or leave unassigned).
  const assignable = canAssignOthers
    ? project.members.map((m) => m.user)
    : project.members.map((m) => m.user).filter((u) => u.id === me.id || u.id === issue?.assigneeId);
  const selectedLabels = watch('labelIds');

  const toggleLabel = (id: string) =>
    setValue(
      'labelIds',
      selectedLabels.includes(id) ? selectedLabels.filter((l) => l !== id) : [...selectedLabels, id],
      { shouldDirty: true, shouldValidate: true },
    );

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-5" noValidate>
      <Field label="Title" error={errors.title?.message}>
        {(p) => <Input {...p} {...register('title')} autoFocus={!issue} placeholder="Short summary of the problem or task" />}
      </Field>

      <Field label="Description" error={errors.description?.message} hint="Steps to reproduce, context, acceptance criteria.">
        {(p) => <Textarea {...p} {...register('description')} rows={7} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type">
          {(p) => (
            <Select {...p} {...register('type')}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{typeLabel[t]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority">
          {(p) => (
            <Select {...p} {...register('priority')}>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>{priorityLabel[pr]}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(p) => (
            <Select {...p} {...register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel[s]}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assignee" hint={canAssignOthers ? undefined : 'You can assign issues to yourself only.'}>
          {(p) => (
            <Select {...p} {...register('assigneeId')}>
              <option value="">Unassigned</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.id === me.id ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Due date">{(p) => <Input {...p} type="date" {...register('dueDate')} />}</Field>
      </div>

      {project.labels.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink-2">Labels</legend>
          <div className="flex flex-wrap gap-1.5">
            {project.labels.map((label) => {
              const on = selectedLabels.includes(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLabel(label.id)}
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2 hover:bg-sunken',
                  )}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                  {label.name}
                </button>
              );
            })}
          </div>
          {errors.labelIds && <p className="mt-1 text-xs text-danger">{errors.labelIds.message}</p>}
        </fieldset>
      )}

      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={() => router.back()} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {issue ? 'Save changes' : 'Create issue'}
        </Button>
      </div>
    </form>
  );
}
