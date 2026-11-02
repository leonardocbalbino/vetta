'use client';

import { ApiRequestError } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Logo,
  Skeleton,
  toast,
} from '@vetta/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

/** O aluno aceita o convite e define a própria senha no primeiro acesso. */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const client = useVettaClient();
  const router = useRouter();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => client.invites.preview(token),
    retry: false,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [health, setHealth] = useState(false);
  const [busy, setBusy] = useState(false);

  if (preview.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            Este convite expirou ou já foi usado. Peça um novo ao seu personal.
          </CardContent>
        </Card>
      </main>
    );
  }
  if (!preview.data) return <Skeleton className="m-6 h-64" />;
  const p = preview.data;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <Logo />
          <h1 className="font-display text-2xl">{p.tenantName} convidou você</h1>
          <p className="text-muted-foreground">
            Olá, {p.studentName.split(' ')[0]}!{' '}
            {p.requiresPassword
              ? 'Crie uma senha para acessar seus treinos.'
              : 'Confirme sua senha atual para adicionar este personal.'}
          </p>
        </CardHeader>
        <CardContent>
          <form
            method="post"
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await client.invites.accept({
                  token,
                  password,
                  ...(p.email ? {} : { email }),
                  acceptTerms: true,
                  acceptHealthDataConsent: health,
                });
                router.replace('/treino');
              } catch (err) {
                toast.error(
                  err instanceof ApiRequestError
                    ? err.message
                    : 'Não foi possível aceitar o convite.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {!p.email ? (
              <Field label="Seu e-mail">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            ) : (
              <p className="text-sm">E-mail: {p.email}</p>
            )}
            <Field
              label={p.requiresPassword ? 'Crie sua senha' : 'Sua senha'}
              hint={p.requiresPassword ? 'Mínimo de 8 caracteres, com letra e número.' : undefined}
            >
              <Input
                type="password"
                required
                autoComplete={p.requiresPassword ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={terms}
                onCheckedChange={(v) => setTerms(!!v)}
                className="mt-0.5"
                aria-label="Aceito os termos"
              />
              Aceito os termos de uso e a política de privacidade.
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={health}
                onCheckedChange={(v) => setHealth(!!v)}
                className="mt-0.5"
                aria-label="Autorizo dados de saúde"
              />
              Autorizo {p.tenantName} a usar meus dados de saúde (anamnese e avaliações) para
              planejar meus treinos.
            </label>
            <Button type="submit" variant="accent" disabled={!terms} loading={busy}>
              Aceitar convite
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
