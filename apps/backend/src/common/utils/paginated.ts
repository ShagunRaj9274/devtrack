export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Returned by list endpoints. The response interceptor passes it through as
 * `{ data, meta }` instead of wrapping it again.
 */
export class Paginated<T> {
  readonly meta: PageMeta;

  constructor(
    readonly data: T[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.meta = { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}

export const skipTake = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});
