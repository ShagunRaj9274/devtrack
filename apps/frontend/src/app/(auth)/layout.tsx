'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageLoader } from '@/components/ui/feedback';
import { useAuth } from '@/lib/auth';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      const next = new URLSearchParams(window.location.search).get('next');
      // Only follow same-site relative paths to avoid open redirects.
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    }
  }, [status, router]);

  if (status !== 'anonymous') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <PageLoader />
      </div>
    );
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded bg-ink text-xs font-bold text-white">DT</span>
          <span className="text-lg font-semibold tracking-tight">DevTrack</span>
        </div>
        {children}
      </div>
    </main>
  );
}
