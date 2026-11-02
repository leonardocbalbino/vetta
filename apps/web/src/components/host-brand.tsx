'use client';

import type { PublicBrand } from '@vetta/contracts';
import { useEffect, useState } from 'react';
import { env } from '@/env';

const DEFAULT_HOSTS = new Set([
  new URL(env.NEXT_PUBLIC_APP_URL).hostname,
  'localhost',
  '127.0.0.1',
]);

/**
 * Domínio próprio do personal: quando o app abre num host que não é o da Vetta, o tema é
 * resolvido pelo host (GET /v1/public/brand?host=) e aplicado já nas telas públicas
 * (entrar, cadastro, convite). Depois do login, o tema do vínculo ativo assume (AppShell).
 */
export function HostBrand() {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  useEffect(() => {
    const host = window.location.hostname;
    if (DEFAULT_HOSTS.has(host)) return;
    const ctrl = new AbortController();
    fetch(`${env.NEXT_PUBLIC_API_URL}/v1/public/brand?host=${encodeURIComponent(host)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<PublicBrand>) : null))
      .then((b) => {
        if (!b?.whiteLabel) return;
        setBrand(b);
        document.title = b.displayName;
        // Login no domínio do personal já seleciona o vínculo dele.
        localStorage.setItem('vetta.hostTenant', b.tenantId);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return brand?.css ? <style data-host-brand={brand.tenantId}>{brand.css}</style> : null;
}
