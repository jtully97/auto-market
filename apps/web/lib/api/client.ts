'use client';

import type { ApiErrorBody } from '@automarket/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  get isPlanLimit() {
    return this.code === 'PLAN_LIMIT' || this.code === 'INSUFFICIENT_CREDITS';
  }
}

let workspaceId: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('am.workspace') : null;
export const setActiveWorkspace = (id: string | null) => {
  workspaceId = id;
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem('am.workspace', id);
  else localStorage.removeItem('am.workspace');
};
export const getActiveWorkspace = () => workspaceId;

let refreshing: Promise<boolean> | null = null;
const refreshSession = () =>
  (refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0)));

export type Query = Record<string, string | number | boolean | undefined | null>;
type Options = Omit<RequestInit, 'body'> & { body?: unknown; query?: Query };

const toQueryString = (query?: Query) => {
  if (!query) return '';
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};

/**
 * Typed fetch wrapper for the API. Adds the workspace header, serialises JSON,
 * transparently refreshes an expired access token once, and turns error
 * bodies into ApiError so the UI can show friendly messages and upgrade prompts.
 */
export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers = new Headers(opts.headers);
  if (workspaceId) headers.set('x-workspace-id', workspaceId);
  const isForm = opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api/v1${path}${toQueryString(opts.query)}`, {
    ...opts,
    headers,
    credentials: 'include',
    body:
      opts.body === undefined
        ? undefined
        : isForm
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !retried && !/^\/auth\/(login|register|refresh)/.test(path)) {
    if (await refreshSession()) return api<T>(path, opts, true);
    if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
      // Outside React (no router here); a full reload also clears in-memory state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as ApiErrorBody).error ?? {
      code: 'UNKNOWN',
      message: 'Something went wrong',
    };
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return data as T;
}
