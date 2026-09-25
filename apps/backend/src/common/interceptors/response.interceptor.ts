import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Paginated } from '../utils/paginated';

/**
 * Every successful response has the same envelope:
 *   { data: ... }                 for single resources / actions
 *   { data: [...], meta: {...} }  for paginated lists
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        if (body instanceof Paginated) return { data: body.data, meta: body.meta };
        return { data: body ?? null };
      }),
    );
  }
}
