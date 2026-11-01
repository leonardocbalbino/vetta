'use client';

import { ApiRequestError } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '@vetta/ui';
import { useActiveTenant } from './session';

/** GET tipado com cache por tenant ativo. */
export function useApi<T>(path: string | null, opts: { enabled?: boolean } = {}) {
  const client = useVettaClient();
  const { tenantId } = useActiveTenant();
  return useQuery<T>({
    queryKey: [path, tenantId],
    queryFn: () => client.request<T>('GET', path!),
    enabled: !!path && (opts.enabled ?? true),
  });
}

/** Mutação com toast de erro padrão e invalidação das chaves indicadas (prefixo do path). */
export function useApiMutation<TBody, TRes = unknown>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string | ((body: TBody) => string),
  opts: { invalidate?: string[]; success?: string; onSuccess?: (r: TRes) => void } = {},
) {
  const client = useVettaClient();
  const qc = useQueryClient();
  return useMutation<TRes, Error, TBody>({
    mutationFn: (body) =>
      client.request<TRes>(
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
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 402) return `${err.message} Faça upgrade para liberar.`;
    return err.message;
  }
  return 'Algo deu errado. Tente novamente.';
}

export const invalidate = (qc: ReturnType<typeof useQueryClient>, key: QueryKey) =>
  qc.invalidateQueries({ queryKey: key });

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Date(d).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';
export const daysAgo = (d: string | Date | null | undefined) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : null;
