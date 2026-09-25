import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-2 text-xl font-semibold">This page doesn&apos;t exist</h1>
        <Link href="/dashboard" className="mt-4 inline-block font-medium text-accent hover:underline">
          Go to your dashboard
        </Link>
      </div>
    </main>
  );
}
