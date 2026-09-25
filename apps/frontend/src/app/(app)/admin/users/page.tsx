'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { roleLabel, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import { ROLES, type Role, type User } from '@/lib/types';

export default function AdminUsersPage() {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [deactivating, setDeactivating] = useState<User | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = { search: debounced, page, limit: 20 };
  const users = useQuery({
    queryKey: qk.users(params),
    queryFn: () => apiPage<User>('/users', params),
    placeholderData: keepPreviousData,
    enabled: me.role === 'ADMIN',
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; isActive?: boolean } }) =>
      api<User>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: (u) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Updated ${u.name}`);
      setDeactivating(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (me.role !== 'ADMIN') return <ErrorState message="Only admins can manage users." />;

  return (
    <>
      <PageHeader title="Users" description="Change roles or deactivate accounts. Deactivated users are signed out immediately." />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="pl-9" aria-label="Search users" />
      </div>
      {users.isError ? (
        <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />
      ) : !users.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[40rem] text-left">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Person</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.data.data.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar user={u} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.name} {self && <span className="text-xs font-normal text-muted">(you)</span>}</p>
                            <p className="truncate text-xs text-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={u.role}
                          disabled={self || !u.isActive || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                          className="h-8 w-44"
                          aria-label={`Role for ${u.name}`}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                        </Select>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{timeAgo(u.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {!self && (u.isActive ? (
                          <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => setDeactivating(u)}>Deactivate</Button>
                        ) : (
                          <Button size="sm" onClick={() => update.mutate({ id: u.id, body: { isActive: true } })}>Reactivate</Button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={users.data.meta} onPage={setPage} />
        </>
      )}
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && update.mutate({ id: deactivating.id, body: { isActive: false } })}
        loading={update.isPending}
        title={`Deactivate ${deactivating?.name}?`}
        description="They are signed out everywhere and can't log in until reactivated. Their issues and comments stay."
        confirmLabel="Deactivate"
      />
    </>
  );
}
