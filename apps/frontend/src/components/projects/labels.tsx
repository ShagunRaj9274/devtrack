'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { api, errorMessage } from '@/lib/api';
import type { Label, ProjectDetail } from '@/lib/types';

const PALETTE = ['#1C7ED6', '#2F9E44', '#E8590C', '#F08C00', '#C92A2A', '#AE3EC9', '#495057', '#0C8599'];

export function LabelsPanel({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const canManage = project.permissions.canManage;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['project', project.id] });

  const create = useMutation({
    mutationFn: () =>
      api<Label>(`/projects/${project.id}/labels`, {
        method: 'POST',
        body: { name, color: PALETTE[project.labels.length % PALETTE.length] },
      }),
    onSuccess: (l) => {
      refresh();
      setName('');
      toast.success(`Created label ${l.name}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/projects/${project.id}/labels/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-medium">Labels</h3>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {project.labels.map((l) => (
          <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full border border-line py-0.5 pr-1 pl-2.5 text-xs">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
            {l.name}
            {canManage && (
              <button onClick={() => remove.mutate(l.id)} className="rounded-full p-0.5 text-muted hover:bg-sunken hover:text-danger" aria-label={`Delete label ${l.name}`}>
                <X className="size-3" />
              </button>
            )}
          </li>
        ))}
        {project.labels.length === 0 && <li className="text-xs text-muted">No labels yet.</li>}
      </ul>
      {canManage && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New label" maxLength={30} className="h-8" aria-label="New label name" />
          <Button type="submit" size="sm" loading={create.isPending} disabled={!name.trim()}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}
