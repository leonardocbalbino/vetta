'use client';

import type { AuthTokens } from '@vetta/contracts';
import { createVettaClient, type TokenStore } from '@vetta/sdk';
import { VettaProvider } from '@vetta/sdk/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';

const API_URL = z.url().parse(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

/** Sessão do admin só na aba (sessionStorage): fechar o navegador encerra o acesso. */
const store: TokenStore = {
  get: () => {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem('vetta:admin');
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  },
  set: (t) =>
    t
      ? sessionStorage.setItem('vetta:admin', JSON.stringify(t))
      : sessionStorage.removeItem('vetta:admin'),
};

export const adminClient = createVettaClient({
  baseUrl: API_URL,
  tokens: store,
  onSessionExpired: () => window.location.assign('/entrar'),
});

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <VettaProvider client={adminClient}>{children}</VettaProvider>
    </QueryClientProvider>
  );
}
