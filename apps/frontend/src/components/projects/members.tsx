'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/feedback';
import { api, apiPage, errorMessage } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { ProjectDetail, ProjectMember, User } from '@/lib/types';

function AddMemberDialog({ project, open, onClose }: { project: ProjectDetail; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const users = useQuery({
    queryKey: qk.users({ search: debounced, limit: 8 }),
    queryFn: () => apiPage<User>('/users', { search: debounced, limit: 8 }),
    enabled: open,
  });
  const memberIds = new Set(project.members.map((m) => m.user.id));

  const add = useMutation({
    mutationFn: (userId: string) => api<ProjectMember>(`/projects/${project.id}/members`, { method: 'POST', body: { userId } }),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: qk.project(project.id) });
      toast.success(`Added ${m.user.name}. They've been notified.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Add people to ${project.name}`}>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username or email" autoFocus aria-label="Search users" />
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
        {users.isPending && <li className="flex justify-center py-6 text-muted"><Spinner /></li>}
        {users.data?.data.filter((u) => u.isActive).map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-2">
            <Avatar user={u} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.name}</p>
              <p className="truncate text-xs text-muted">@{u.username} · {roleLabel[u.role]}</p>
            </div>
            {memberIds.has(u.id) ? (
              <span className="text-xs text-muted">Member</span>
            ) : (
              <Button size="sm" onClick={() => add.mutate(u.id)} loading={add.isPending && add.variables === u.id}>
                Add
              </Button>
            )}
          </li>
        ))}
        {users.data?.data.length === 0 && <li className="py-6 text-center text-muted">No people match “{debounced}”.</li>}
      </ul>
    </Dialog>
  );
}

export function MembersPanel({ project }: { project: ProjectDetail }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const remove = useMutation({
    mutationFn: (userId: string) => api(`/projects/${project.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success(`Removed ${removing?.user.name}`);
      setRemoving(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <section className="rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="font-medium">Members <span className="font-normal text-muted">{project.members.length}</span></h3>
        {project.permissions.canManage && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="size-3.5" aria-hidden /> Add
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line">
        {project.members.map((m) => (
          <li key={m.user.id} className="flex items-center gap-3 px-4 py-2">
            <Avatar user={m.user} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate">{m.user.name}</p>
              <p className="text-xs text-muted">{m.user.id === project.ownerId ? 'Owner' : roleLabel[m.user.role]}</p>
            </div>
            {project.permissions.canManage && m.user.id !== project.ownerId && (
              <button onClick={() => setRemoving(m)} className="rounded p-1.5 text-muted hover:bg-sunken hover:text-danger" aria-label={`Remove ${m.user.name}`}>
                <UserMinus className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <AddMemberDialog project={project} open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.user.id)}
        loading={remove.isPending}
        title={`Remove ${removing?.user.name}?`}
        description="They lose access to this project, and issues assigned to them here become unassigned."
        confirmLabel="Remove member"
      />
    </section>
  );
}
