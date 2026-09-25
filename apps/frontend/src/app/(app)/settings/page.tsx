'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/layout/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api, ApiError, errorMessage, setAccessToken } from '@/lib/api';
import { useAuth, useCurrentUser } from '@/lib/auth';
import { roleLabel } from '@/lib/format';
import type { User } from '@/lib/types';

const COLORS = ['#364FC7', '#0C8599', '#E8590C', '#9C36B5', '#2B8A3E', '#C92A2A', '#5F3DC4', '#495057'];

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,30}$/, '3–30 characters: letters, numbers, _ or -'),
  avatarColor: z.string(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().regex(/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/, 'At least 8 characters, with a letter and a number'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

function ProfileForm() {
  const user = useCurrentUser();
  const { setUser } = useAuth();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting, isDirty } } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { name: user.name, username: user.username, avatarColor: user.avatarColor },
  });
  const color = watch('avatarColor');

  const onSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      setUser(await api<User>('/users/me', { method: 'PATCH', body: values }));
      toast.success('Profile saved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('username', { message: err.message });
      else toast.error(errorMessage(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center gap-3">
        <Avatar user={{ ...user, name: watch('name') || user.name, avatarColor: color }} size="lg" />
        <div>
          <p className="font-medium">{user.email}</p>
          <p className="text-xs text-muted">{roleLabel[user.role]}. Only admins can change roles.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={errors.name?.message}>{(p) => <Input {...p} {...register('name')} />}</Field>
        <Field label="Username" error={errors.username?.message}>{(p) => <Input {...p} {...register('username')} />}</Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[0.8125rem] font-medium text-ink-2">Avatar colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setValue('avatarColor', c, { shouldDirty: true })}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={clsx('size-7 rounded-full ring-offset-2', color === c && 'ring-2 ring-ink')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      <div><Button type="submit" variant="primary" loading={isSubmitting} disabled={!isDirty}>Save profile</Button></div>
    </form>
  );
}

function PasswordForm() {
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
  });
  const onSubmit = async ({ currentPassword, newPassword }: z.infer<typeof passwordSchema>) => {
    try {
      const res = await api<{ accessToken: string }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      setAccessToken(res.accessToken);
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('currentPassword', { message: err.message });
      else if (err instanceof ApiError && err.status === 400) setError('newPassword', { message: err.message });
      else toast.error(errorMessage(err));
    }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Current password" error={errors.currentPassword?.message}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('currentPassword')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" error={errors.newPassword?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('newPassword')} />}
        </Field>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('confirm')} />}
        </Field>
      </div>
      <div><Button type="submit" variant="primary" loading={isSubmitting}>Change password</Button></div>
    </form>
  );
}

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">Profile</h2>
        <ProfileForm />
      </section>
      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold">Password</h2>
        <p className="mb-4 text-xs text-muted">Changing your password signs you out everywhere else.</p>
        <PasswordForm />
      </section>
    </div>
  );
}
