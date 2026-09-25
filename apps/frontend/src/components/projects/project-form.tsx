'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { Project, ProjectDetail, ProjectStatus } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name needs at least 2 characters').max(80),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, '2–10 letters or digits, starting with a letter'),
  description: z.string().max(2000),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'ARCHIVED']),
});
type Values = z.infer<typeof schema>;

const STATUS_LABEL: Record<ProjectStatus, string> = { ACTIVE: 'Active', ON_HOLD: 'On hold', ARCHIVED: 'Archived' };

/** Create (no project) or edit (with project) in a dialog. The key can't change after creation. */
export function ProjectFormDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project?: ProjectDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: project?.name ?? '',
      key: project?.key ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'ACTIVE',
    },
  });

  const save = useMutation({
    mutationFn: (v: Values) =>
      project
        ? api<Project>(`/projects/${project.id}`, { method: 'PATCH', body: { name: v.name, description: v.description, status: v.status } })
        : api<Project>('/projects', { method: 'POST', body: { name: v.name, key: v.key, description: v.description || undefined } }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', saved.id] });
      toast.success(project ? 'Project saved' : `Created ${saved.name}`);
      onClose();
      reset();
      if (!project) router.push(`/projects/${saved.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setError('key', { message: err.message });
      else toast.error(errorMessage(err));
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title={project ? 'Edit project' : 'New project'}>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Name" error={errors.name?.message}>
            {(p) => <Input {...p} {...register('name')} autoFocus placeholder="Web Storefront" />}
          </Field>
          <Field label="Key" error={errors.key?.message} hint={project ? 'Keys are permanent.' : 'Prefix for issue keys'}>
            {(p) => <Input {...p} {...register('key')} disabled={!!project} placeholder="WEB" className="font-mono uppercase" />}
          </Field>
        </div>
        <Field label="Description" error={errors.description?.message}>
          {(p) => <Textarea {...p} {...register('description')} rows={3} />}
        </Field>
        {project && (
          <Field label="Status">
            {(p) => (
              <Select {...p} {...register('status')}>
                {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {project ? 'Save project' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export { STATUS_LABEL as projectStatusLabel };
