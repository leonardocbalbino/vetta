'use client';

import { useMe, useVettaClient } from '@vetta/sdk/react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Switch,
  toast,
} from '@vetta/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApiMutation } from '@/lib/api';
import { WhatsAppCard } from '@/components/whatsapp-optin';

/** Perfil do aluno: dados, lembrete diário de treino e direitos LGPD. */
export default function ProfilePage() {
  const me = useMe();
  const client = useVettaClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState('07:00');
  useEffect(() => {
    if (me.data) setName(me.data.name);
  }, [me.data]);
  const save = useApiMutation<object>('PATCH', '/v1/me', {
    invalidate: ['me'],
    success: 'Perfil salvo.',
  });
  if (!me.data) return <Skeleton className="h-64" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Perfil</h1>
      <Button variant="secondary" asChild className="self-start">
        <Link href="/perfil/autorizacoes">Autorizações de fotos e depoimento</Link>
      </Button>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </Field>
          <label className="flex min-h-11 items-center gap-3">
            <Switch
              checked={reminder}
              onCheckedChange={setReminder}
              aria-label="Lembrete diário de treino"
            />{' '}
            Lembrete diário de treino
          </label>
          {reminder ? (
            <Field label="Horário do lembrete">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="max-w-40"
              />
            </Field>
          ) : null}
          <Button
            className="self-start"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                name,
                ...(birth ? { birthDate: birth } : {}),
                trainingReminderEnabled: reminder,
                trainingReminderTime: reminder ? time : null,
              })
            }
          >
            Salvar
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Seus dados (LGPD)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const data = await client.request('GET', '/v1/me/export');
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'meus-dados-vetta.json';
              a.click();
            }}
          >
            Exportar meus dados
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              if (
                !confirm(
                  'Excluir sua conta? Seus dados pessoais serão anonimizados e você perderá o acesso.',
                )
              )
                return;
              try {
                await client.request('DELETE', '/v1/me');
                await client.tokens.set(null);
                router.replace('/entrar');
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>
      <WhatsAppCard />
    </div>
  );
}
