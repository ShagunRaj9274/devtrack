'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Bell, FolderKanban, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { api, apiPage } from '@/lib/api';
import { useCurrentUser, useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { ProjectListItem } from '@/lib/types';

function NavLink({ href, icon: Icon, children, exact }: { href: string; icon: typeof Bell; children: React.ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 font-medium transition-colors',
        active ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-sunken hover:text-ink',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

function useUnreadCount() {
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    // Sockets push new notifications; polling is only a slow safety net.
    refetchInterval: 120_000,
  });
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const unread = useUnreadCount().data?.count ?? 0;
  const projects = useQuery({
    queryKey: qk.projects({ limit: 8 }),
    queryFn: () => apiPage<ProjectListItem>('/projects', { limit: 8 }),
  });

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" onClick={(e) => (e.target as HTMLElement).closest('a') && onNavigate?.()}>
      <Link href="/dashboard" className="flex items-center gap-2 px-2.5">
        <span className="grid size-6 place-items-center rounded bg-ink text-[0.6875rem] font-bold text-white">DT</span>
        <span className="text-[0.9375rem] font-semibold tracking-tight">DevTrack</span>
      </Link>

      <div className="flex flex-col gap-0.5">
        <NavLink href="/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
        <NavLink href="/projects" icon={FolderKanban} exact>Projects</NavLink>
        <NavLink href="/notifications" icon={Bell}>
          <span className="flex flex-1 items-center justify-between">
            Notifications
            {unread > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>
            )}
          </span>
        </NavLink>
        {user.role === 'ADMIN' && <NavLink href="/admin/users" icon={Users}>Users</NavLink>}
        <NavLink href="/settings" icon={Settings}>Settings</NavLink>
      </div>

      <div>
        <p className="mb-1.5 px-2.5 text-xs font-medium text-muted">Your projects</p>
        <ul className="flex flex-col gap-0.5">
          {projects.data?.data.map((p) => {
            const active = pathname.startsWith(`/projects/${p.id}`);
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}/board`}
                  className={clsx(
                    'flex items-center gap-2 rounded-md px-2.5 py-1.5',
                    active ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:bg-sunken',
                  )}
                >
                  <span className="w-9 shrink-0 font-mono text-[0.6875rem] text-muted">{p.key}</span>
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            );
          })}
          {projects.data?.data.length === 0 && <li className="px-2.5 text-xs text-muted">No projects yet</li>}
        </ul>
      </div>
    </nav>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  return (
    <div className="flex items-center gap-3">
      <Link href="/settings" className="flex items-center gap-2 rounded-md py-1 pr-1.5 hover:bg-sunken">
        <Avatar user={user} size="sm" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[0.8125rem] font-medium">{user.name}</span>
          <span className="block text-[0.6875rem] text-muted">{roleLabel[user.role]}</span>
        </span>
      </Link>
      <button onClick={() => void logout()} className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink" title="Log out" aria-label="Log out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const unread = useUnreadCount().data?.count ?? 0;
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-line bg-surface shadow-xl">
            <button onClick={() => setDrawer(false)} className="absolute top-3 right-3 rounded p-1.5 text-muted hover:bg-sunken" aria-label="Close navigation">
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-8">
          <button onClick={() => setDrawer(true)} className="rounded-md p-1.5 text-ink-2 hover:bg-sunken lg:hidden" aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Link href="/notifications" className="relative rounded-md p-1.5 text-ink-2 hover:bg-sunken" aria-label={`Notifications, ${unread} unread`}>
            <Bell className="size-[1.125rem]" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[0.625rem] leading-4 font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Title row used at the top of every page. */
export function PageHeader({ title, description, actions, before }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; before?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {before}
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
