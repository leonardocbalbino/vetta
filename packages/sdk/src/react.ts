import type { FeatureKey } from '@vetta/contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { VettaClient } from './client.js';
import { featureState, type FeatureState } from './entitlements.js';

const ClientContext = createContext<VettaClient | null>(null);

export function VettaProvider({ client, children }: { client: VettaClient; children: ReactNode }) {
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useVettaClient(): VettaClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error('useVettaClient precisa de <VettaProvider>');
  return c;
}

export const queryKeys = {
  me: ['me'] as const,
  entitlements: (tenantId: string | null) => ['entitlements', tenantId] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useMe() {
  const client = useVettaClient();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => client.me(), staleTime: 60_000 });
}

/** Plano, features e limites do vínculo ativo (GET /v1/me/entitlements). */
export function useEntitlements(tenantId: string | null, opts: { enabled?: boolean } = {}) {
  const client = useVettaClient();
  return useQuery({
    queryKey: queryKeys.entitlements(tenantId),
    queryFn: () => client.entitlements(),
    enabled: !!tenantId && (opts.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Estado de uma feature para esconder ou mostrar cadeado com CTA de upgrade.
 * Enquanto carrega, `loading` é true e `locked` é false (sem piscar cadeado).
 */
export function useFeature(
  tenantId: string | null,
  key: FeatureKey,
): FeatureState & { loading: boolean } {
  const q = useEntitlements(tenantId);
  const state = featureState(q.data, key);
  return { ...state, loading: q.isLoading, locked: q.isLoading ? false : state.locked };
}

export function useUnreadCount() {
  const client = useVettaClient();
  return useQuery({
    queryKey: queryKeys.unread,
    queryFn: () => client.notifications.unreadCount(),
    refetchInterval: 60_000,
  });
}
