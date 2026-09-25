import { clsx } from 'clsx';
import { initials } from '@/lib/format';
import type { UserSummary } from '@/lib/types';

export function Avatar({ user, size = 'md', className }: { user: UserSummary; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'size-6 text-[0.625rem]', md: 'size-7 text-xs', lg: 'size-10 text-sm' }[size];
  return (
    <span
      title={user.name}
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', dims, className)}
      style={{ backgroundColor: user.avatarColor }}
    >
      {initials(user.name)}
    </span>
  );
}
