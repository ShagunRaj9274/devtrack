'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageLoader } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';

/** Everything in (app) requires a session; anonymous visitors go to /login. */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') {
      const next = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <PageLoader label="Signing you in" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
