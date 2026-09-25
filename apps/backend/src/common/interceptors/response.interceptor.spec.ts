import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Paginated } from '../utils/paginated';
import { ResponseInterceptor } from './response.interceptor';

const run = (value: unknown) =>
  lastValueFrom(
    new ResponseInterceptor().intercept(
      {} as ExecutionContext,
      { handle: () => of(value) } as CallHandler,
    ),
  );

describe('ResponseInterceptor', () => {
  it('wraps plain values in { data }', async () => {
    expect(await run({ id: 1 })).toEqual({ data: { id: 1 } });
    expect(await run(undefined)).toEqual({ data: null });
  });

  it('returns paginated results as { data, meta }', async () => {
    expect(await run(new Paginated([1, 2], 45, 2, 20))).toEqual({
      data: [1, 2],
      meta: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });
    expect(
      (await run(new Paginated([], 0, 1, 20))) as { meta: { totalPages: number } },
    ).toMatchObject({ meta: { totalPages: 1 } });
  });
});
