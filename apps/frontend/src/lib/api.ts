import type { Page } from './types';

/**
 * Base URL for REST calls. In proxy mode (API_PROXY_TARGET set at build time, see
 * next.config.ts) calls go to this app's own /api, which forwards them to the API.
 */
export const API_URL =
  process.env.DEVTRACK_API_PROXY === '1' ? '' : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

/** WebSockets can't go through the proxy on most hosts, so they connect to the API directly. */
export const SOCKET_URL = process.env.DEVTRACK_SOCKET_URL || API_URL;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

// The access token lives only in memory; the refresh token is an httpOnly cookie
// the browser sends to /api/auth/* automatically. Nothing sensitive in localStorage.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

// Several requests can fail with 401 at once when the token expires; they all
// wait for one shared refresh instead of each rotating the cookie.
let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      accessToken = body.data.accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

export function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','));
    } else params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
}

async function send(path: string, options: RequestOptions, retry: boolean): Promise<Response> {
  const res = await fetch(`${API_URL}/api${path}${toQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return send(path, options, false);
    accessToken = null;
    onSessionExpired?.();
  }
  return res;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = body?.message;
    const details = Array.isArray(raw) ? raw : undefined;
    const message = details ? details[0] : (raw ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, details);
  }
  return body;
}

/** Returns the unwrapped `data` of a response. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = await parse(await send(path, options, true));
  return (body?.data ?? null) as T;
}

/** For paginated endpoints: returns `{ data, meta }`. */
export async function apiPage<T>(path: string, query?: Query): Promise<Page<T>> {
  return (await parse(await send(path, { query }, true))) as Page<T>;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Cannot reach the DevTrack API. Check that the backend is running.';
  return fallback;
}
