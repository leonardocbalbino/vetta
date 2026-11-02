'use client';

import { AuthTokensSchema } from '@vetta/contracts';
import { Skeleton } from '@vetta/ui';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const Payload = AuthTokensSchema.extend({ tenantId: z.uuid() });

/**
 * Recebe a sessão de impersonação aberta pelo painel admin. Os tokens chegam no
 * fragmento (#), que o navegador não envia a servidores; o fragmento é apagado em seguida.
 */
export default function Impersonar() {
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      const raw = window.location.hash.slice(1);
      history.replaceState(null, '', '/impersonar');
      const p = Payload.parse(JSON.parse(atob(raw)));
      const { tenantId, ...tokens } = p;
      localStorage.setItem('vetta:tokens', JSON.stringify(tokens));
      localStorage.setItem('vetta:tenant', tenantId);
      window.location.replace('/inicio');
    } catch {
      setError(true);
    }
  }, []);
  return error ? (
    <main className="p-6">
      Link de impersonação inválido ou expirado. Abra de novo pelo painel admin.
    </main>
  ) : (
    <Skeleton className="m-6 h-40" />
  );
}
