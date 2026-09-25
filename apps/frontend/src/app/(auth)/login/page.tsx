'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

// Accounts created by `npm run db:seed`, shown so reviewers can try every role.
const DEMO = [
  { email: 'admin@devtrack.dev', role: 'Admin' },
  { email: 'priya@devtrack.dev', role: 'Project manager' },
  { email: 'marco@devtrack.dev', role: 'Developer' },
  { email: 'viewer@devtrack.dev', role: 'Viewer' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: Values) => {
    setError(null);
    try {
      await login(values.email, values.password);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 text-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-danger">
            {error}
          </p>
        )}
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1">
          Log in
        </Button>
      </form>

      <div className="mt-8 rounded-lg border border-line bg-surface p-4">
        <p className="font-medium">Demo accounts</p>
        <p className="mt-0.5 text-xs text-muted">Password for all: Password123. Pick one to fill the form.</p>
        <ul className="mt-3 flex flex-col gap-1">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => {
                  setValue('email', d.email, { shouldValidate: true });
                  setValue('password', 'Password123', { shouldValidate: true });
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-sunken"
              >
                <span className="text-ink-2">{d.email}</span>
                <span className="text-xs text-muted">{d.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
