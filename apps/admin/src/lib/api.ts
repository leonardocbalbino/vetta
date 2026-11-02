'use client';

import { ApiRequestError } from '@vetta/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@vetta/ui';
import { adminClient } from './client';

export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

type Query = Record<string, string | number | undefined>;

/** GET tipado do painel (a chave do cache é o path + query). */
export function useAdminApi<T>(path: string | null, query?: Query) {
  return useQuery<T>({
    queryKey: [path, query],
    queryFn: () => adminClient.request<T>('GET', path!, undefined, query),
    enabled: !!path,
  });
}

/** Mutação com toast de erro e invalidação por prefixo do path. */
export function useAdminMutation<TBody, TRes = unknown>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string | ((body: TBody) => string),
  opts: { invalidate?: string[]; success?: string; onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TBody>({
    mutationFn: (body) =>
      adminClient.request<TRes>(
        method,
        typeof path === 'function' ? path(body) : path,
        method === 'DELETE' ? undefined : body,
      ),
    onSuccess: async (r) => {
      for (const p of opts.invalidate ?? []) {
        await qc.invalidateQueries({
          predicate: (q) =>
            typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(p),
        });
      }
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiRequestError ? err.message : 'Algo deu errado. Tente novamente.',
      ),
  });
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
export const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';
export const fmtBytes = (b: number) =>
  b >= 1e9
    ? `${(b / 1e9).toFixed(1)} GB`
    : b >= 1e6
      ? `${(b / 1e6).toFixed(1)} MB`
      : `${Math.round(b / 1e3)} KB`;
export const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
