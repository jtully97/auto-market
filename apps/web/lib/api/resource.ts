'use client';

import type { Paginated } from '@automarket/shared';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, type Query } from './client';

/**
 * React Query bindings for a REST resource. One line per resource instead of
 * hand-writing list/get/create/update/remove hooks for each:
 *
 *   export const brands = createResource<Brand, BrandProfileInput>('brands', '/brands');
 *   const { data } = brands.useList();
 */
export function createResource<T, TCreate = Partial<T>, TUpdate = Partial<TCreate>>(
  key: string,
  path: string,
  opts: { updateMethod?: 'PATCH' | 'PUT' } = {},
) {
  const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
    qc.invalidateQueries({ queryKey: [key] });

  return {
    key,
    useList: (query?: Query, options?: Partial<UseQueryOptions<Paginated<T>>>) =>
      useQuery({
        queryKey: [key, 'list', query ?? {}],
        queryFn: () => api<Paginated<T>>(path, { query }),
        ...options,
      }),

    useOne: (id: string | null | undefined, options?: Partial<UseQueryOptions<T>>) =>
      useQuery({
        queryKey: [key, 'one', id],
        queryFn: () => api<T>(`${path}/${id}`),
        enabled: Boolean(id),
        ...options,
      }),

    useCreate: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (body: TCreate) => api<T>(path, { method: 'POST', body }),
        onSuccess: () => invalidate(qc),
      });
    },

    useUpdate: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: ({ id, ...body }: TUpdate & { id: string }) =>
          api<T>(`${path}/${id}`, { method: opts.updateMethod ?? 'PATCH', body }),
        onSuccess: () => invalidate(qc),
      });
    },

    useRemove: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (id: string) => api<void>(`${path}/${id}`, { method: 'DELETE' }),
        onSuccess: () => invalidate(qc),
      });
    },

    /** Custom action on the resource, e.g. `posts.useAction((id) => `/${id}/approve`)`. */
    useAction: <V = { id: string }, R = T>(
      build: (vars: V) => { path: string; body?: unknown; method?: string },
    ) => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (vars: V) => {
          const req = build(vars);
          return api<R>(`${path}${req.path}`, { method: req.method ?? 'POST', body: req.body });
        },
        onSuccess: () => invalidate(qc),
      });
    },
  };
}
