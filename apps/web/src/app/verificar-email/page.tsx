'use client';

import { useVettaClient } from '@vetta/sdk/react';
import { Button, Card, CardContent, CardHeader, CardTitle, Logo } from '@vetta/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function Verify() {
  const token = useSearchParams().get('token');
  const client = useVettaClient();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) return setState('error');
    client.auth
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token, client]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="gap-4">
        <Logo />
        <CardTitle>
          {state === 'loading'
            ? 'Confirmando seu e-mail…'
            : state === 'ok'
              ? 'E-mail confirmado!'
              : 'Link inválido ou expirado'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button asChild variant={state === 'ok' ? 'accent' : 'secondary'}>
          <Link href="/inicio">Ir para o app</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <Verify />
      </Suspense>
    </main>
  );
}
