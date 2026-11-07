'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Skeleton,
  Switch,
} from '@vetta/ui';
import { MessageSquareText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fmtDateTime, useAdminApi, useAdminMutation } from '@/lib/api';

interface SmsProvider {
  provider: 'textbee' | 'twilio';
  enabled: boolean;
  priority: number;
  config: Record<string, string>;
  secrets: Record<string, string | null>;
  ready: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

const INFO: Record<
  SmsProvider['provider'],
  {
    title: string;
    description: string;
    config: { key: string; label: string; hint?: string }[];
    secrets: { key: string; label: string }[];
  }
> = {
  textbee: {
    title: 'textbee',
    description:
      'Envia pelo chip de um celular Android com o app do textbee. Barato para começar (o plano grátis tem 50 SMS/dia).',
    config: [
      {
        key: 'deviceId',
        label: 'ID do aparelho',
        hint: 'No painel do textbee, em Devices. Em branco = aparelho padrão.',
      },
      {
        key: 'baseUrl',
        label: 'URL da API',
        hint: 'Só se usar textbee próprio. Padrão: https://api.textbee.dev/api/v1',
      },
    ],
    secrets: [{ key: 'apiKey', label: 'Chave de API' }],
  },
  twilio: {
    title: 'Twilio',
    description: 'Envio por operadora, cobrado por mensagem. Bom como reserva.',
    config: [
      { key: 'accountSid', label: 'Account SID' },
      { key: 'from', label: 'Remetente', hint: 'Número (+1…) ou Messaging Service SID (MG…).' },
    ],
    secrets: [{ key: 'authToken', label: 'Auth Token' }],
  },
};

function ProviderCard({ p }: { p: SmsProvider }) {
  const info = INFO[p.provider];
  const [enabled, setEnabled] = useState(p.enabled);
  const [priority, setPriority] = useState(String(p.priority));
  const [config, setConfig] = useState<Record<string, string>>(p.config ?? {});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [to, setTo] = useState('');
  useEffect(() => {
    setEnabled(p.enabled);
    setPriority(String(p.priority));
    setConfig(p.config ?? {});
    setSecrets({});
  }, [p]);
  const save = useAdminMutation<object>('PUT', `/v1/admin/integrations/sms/${p.provider}`, {
    invalidate: ['/v1/admin/integrations'],
    success: 'Configuração salva.',
  });
  const test = useAdminMutation<object, { ok: boolean }>(
    'POST',
    `/v1/admin/integrations/sms/${p.provider}/test`,
    { invalidate: ['/v1/admin/integrations'], success: 'SMS de teste enviado.' },
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{info.title}</CardTitle>
          {p.priority === 1 && p.enabled ? <Badge variant="action">principal</Badge> : null}
          {p.enabled ? (
            p.ready ? (
              <Badge variant="success">pronto</Badge>
            ) : (
              <Badge variant="warning">falta credencial</Badge>
            )
          ) : (
            <Badge variant="outline">desligado</Badge>
          )}
        </div>
        <CardDescription>{info.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ enabled, priority: Number(priority), config, secrets });
          }}
        >
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch id={`on-${p.provider}`} checked={enabled} onCheckedChange={setEnabled} />
            <label htmlFor={`on-${p.provider}`}>Usar este provedor</label>
          </div>
          <Field
            label="Prioridade"
            hint="1 = tentado primeiro; os outros ligados servem de reserva."
          >
            <Input
              type="number"
              min={1}
              max={99}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </Field>
          {info.config.map((c) => (
            <Field key={c.key} label={c.label} hint={c.hint}>
              <Input
                value={config[c.key] ?? ''}
                onChange={(e) => setConfig({ ...config, [c.key]: e.target.value })}
              />
            </Field>
          ))}
          {info.secrets.map((s) => (
            <Field
              key={s.key}
              label={s.label}
              hint={
                p.secrets[s.key]
                  ? `Salvo (${p.secrets[s.key]}). Deixe em branco para manter.`
                  : 'Ainda não informado.'
              }
            >
              <Input
                type="password"
                autoComplete="off"
                value={secrets[s.key] ?? ''}
                onChange={(e) => setSecrets({ ...secrets, [s.key]: e.target.value })}
              />
            </Field>
          ))}
          <div className="md:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Salvar
            </Button>
          </div>
        </form>

        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm font-semibold">Enviar SMS de teste por este provedor</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Celular" className="w-60">
              <Input
                placeholder="+5511999999999"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              loading={test.isPending}
              disabled={!p.ready || !to}
              onClick={() => test.mutate({ to })}
            >
              Enviar teste
            </Button>
          </div>
          {p.lastTestAt ? (
            <p className={`text-sm ${p.lastTestOk ? 'text-success' : 'text-danger'}`}>
              Último teste em {fmtDateTime(p.lastTestAt)}:{' '}
              {p.lastTestOk ? 'enviado' : `falhou (${p.lastTestError})`}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** Integrações da plataforma: SMS (códigos e alertas de segurança). */
export default function IntegrationsPage() {
  const sms = useAdminApi<SmsProvider[]>('/v1/admin/integrations/sms');
  return (
    <>
      <h1 className="font-display text-3xl font-extrabold">Integrações</h1>
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <MessageSquareText className="size-5" aria-hidden /> SMS
          </h2>
          <p className="text-sm text-muted-foreground">
            Usado só para códigos e alertas de segurança. O envio tenta o provedor de menor
            prioridade e, se falhar, passa para o próximo ligado.
          </p>
        </div>
        {!sms.data ? (
          <Skeleton className="h-64" />
        ) : (
          sms.data.map((p) => <ProviderCard key={p.provider} p={p} />)
        )}
      </section>
    </>
  );
}
