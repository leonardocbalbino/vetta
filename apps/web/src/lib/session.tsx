'use client';

import type { AuthTokens } from '@vetta/contracts';
import { createVettaClient, type TokenStore, type VettaClient } from '@vetta/sdk';
import { VettaProvider } from '@vetta/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { env } from '@/env';

const TOKENS_KEY = 'vetta:tokens';
const TENANT_KEY = 'vetta:tenant';

/**
 * Fase 0: tokens no localStorage para desenvolvimento.
 * Pendência (Fase 1): BFF no Next com refresh token em cookie httpOnly.
 */
const browserStore: TokenStore = {
  get: () => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  },
  set: (t) => {
    if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKENS_KEY);
  },
};

interface TenantCtx {
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
}
const TenantContext = createContext<TenantCtx>({ tenantId: null, setTenantId: () => {} });
export const useActiveTenant = () => useContext(TenantContext);

export function Providers({ children }: { children: ReactNode }) {
  const [tenantId, setTenant] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : // No domínio próprio do personal, o vínculo dele vem primeiro.
        (localStorage.getItem('vetta.hostTenant') ?? localStorage.getItem(TENANT_KEY)),
  );
  const tenantRef = useMemo(() => ({ current: tenantId }), [tenantId]);
  const client: VettaClient = useMemo(
    () =>
      createVettaClient({
        baseUrl: env.NEXT_PUBLIC_API_URL,
        tokens: browserStore,
        getTenantId: () => tenantRef.current,
        onSessionExpired: () => window.location.assign('/entrar'),
      }),
    [tenantRef],
  );
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  const setTenantId = (id: string | null) => {
    if (id) localStorage.setItem(TENANT_KEY, id);
    else localStorage.removeItem(TENANT_KEY);
    setTenant(id);
    void queryClient.invalidateQueries();
  };
  return (
    <QueryClientProvider client={queryClient}>
      <VettaProvider client={client}>
        <TenantContext.Provider value={{ tenantId, setTenantId }}>
          {children}
        </TenantContext.Provider>
      </VettaProvider>
    </QueryClientProvider>
  );
}
