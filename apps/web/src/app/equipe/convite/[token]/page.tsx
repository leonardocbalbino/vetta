'use client';

import {
  ASSISTANT_PERMISSION_LABEL,
  type AssistantPermission,
  type AuthTokens,
} from '@vetta/contracts';
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

interface Preview {
  tenantName: string;
  name: string;
  email: string;
  permissions: AssistantPermission[];
  requiresPassword: boolean;
}

/** O assistente aceita o convite da equipe e define a senha no primeiro acesso. */
export default function TeamInvitePage() {
  const { token } = useParams<{ token: string }>();
  const client = useVettaClient();
  const router = useRouter();
  const preview = useQuery({
    queryKey: ['team-invite', token],
    queryFn: () => client.request<Preview>('GET', `/v1/team/invites/${encodeURIComponent(token)}`),
    retry: false,
  });
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  if (preview.isError) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            Este convite expirou ou já foi usado. Peça um novo ao personal.
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
          <h1 className="font-display text-2xl">Entre para a equipe de {p.tenantName}</h1>
          <p className="text-muted-foreground">
            Olá, {p.name.split(' ')[0]}! Você vai acompanhar os alunos que o personal atribuir a
            você.
          </p>
          <ul className="list-disc pl-5 text-sm">
            {p.permissions.map((x) => (
              <li key={x}>{ASSISTANT_PERMISSION_LABEL[x]}</li>
            ))}
          </ul>
        </CardHeader>
        <CardContent>
          <form
            method="post"
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const tokens = await client.request<AuthTokens>('POST', '/v1/team/invites/accept', {
                  token,
                  password,
                  acceptTerms: true,
                });
                await client.tokens.set(tokens);
                router.replace('/inicio');
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
            <p className="text-sm">E-mail: {p.email}</p>
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
            <Button type="submit" variant="accent" disabled={!terms} loading={busy}>
              Aceitar convite
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
