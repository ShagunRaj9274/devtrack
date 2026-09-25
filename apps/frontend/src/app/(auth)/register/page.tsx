'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_-]{3,30}$/, '3–30 characters: letters, numbers, _ or -'),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .regex(/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/, 'At least 8 characters, with a letter and a number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (form: Values) => {
    const { name, username, email, password } = form;
    const values = { name, username, email, password };
    setError(null);
    try {
      await signUp(values);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFieldError(/email/i.test(err.message) ? 'email' : 'username', { message: err.message });
      } else setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-muted">
        Already have one?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Log in
        </Link>
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-danger">
            {error}
          </p>
        )}
        <Field label="Full name" error={errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" {...register('name')} />}
        </Field>
        <Field label="Username" error={errors.username?.message} hint="Teammates mention you with @username.">
          {(p) => <Input {...p} autoComplete="username" {...register('username')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-1">
          Create account
        </Button>
        <p className="text-xs text-muted">New accounts start as developers. An admin can change your role.</p>
      </form>
    </>
  );
}
