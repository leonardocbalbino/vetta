'use client';

import type { AuthTokens } from '@vetta/contracts';
import { ApiRequestError } from '@vetta/sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Logo,
  toast,
} from '@vetta/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { adminClient } from '@/lib/client';

type Step =
  | { kind: 'credentials' }
  | { kind: 'setup'; challenge: string; secret?: string; otpauthUrl?: string }
  | { kind: 'code'; challenge: string };

/** Login da equipe: senha + 2FA TOTP obrigatório (configurado no primeiro acesso). */
export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  const login = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await adminClient.request<{
        challengeToken: string;
        twoFactorSetupRequired?: true;
      }>('POST', '/v1/admin/auth/login', { email, password });
      if (r.twoFactorSetupRequired) {
        const s = await adminClient.request<{ secret: string; otpauthUrl: string }>(
          'POST',
          '/v1/admin/auth/2fa/setup',
          { token: r.challengeToken },
        );
        setStep({ kind: 'setup', challenge: r.challengeToken, ...s });
      } else setStep({ kind: 'code', challenge: r.challengeToken });
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (step.kind === 'credentials') return;
    void run(async () => {
      const r = await adminClient.request<AuthTokens & { recoveryCodes?: string[] }>(
        'POST',
        '/v1/admin/auth/2fa/verify',
        {
          challengeToken: step.challenge,
          code,
        },
      );
      await adminClient.tokens.set(r);
      if (r.recoveryCodes) setRecovery(r.recoveryCodes);
      else router.replace('/painel');
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-tinta p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <Logo />
          <CardTitle>Painel da plataforma</CardTitle>
          <CardDescription>Acesso restrito à equipe Vetta.</CardDescription>
        </CardHeader>
        <CardContent>
          {recovery ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm">Guarde seus códigos de recuperação. Eles aparecem só agora.</p>
              <pre className="rounded-control bg-muted p-3 text-sm">{recovery.join('\n')}</pre>
              <Button onClick={() => router.replace('/painel')}>Continuar</Button>
            </div>
          ) : step.kind === 'credentials' ? (
            <form onSubmit={login} className="flex flex-col gap-4">
              <Field label="E-mail">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Senha">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" loading={busy}>
                Continuar
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="flex flex-col gap-4">
              {step.kind === 'setup' ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p>Configure a verificação em duas etapas no seu app autenticador com a chave:</p>
                  <code className="break-all rounded-control bg-muted p-2">{step.secret}</code>
                </div>
              ) : null}
              <Field label="Código de 6 dígitos" hint="Ou um código de recuperação.">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" loading={busy}>
                Entrar
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
