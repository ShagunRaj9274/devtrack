import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@/lib/types';
import { Button } from './button';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4 text-muted">
      <span>
        {from}–{to} of {meta.total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Button>
        <Button size="sm" onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
