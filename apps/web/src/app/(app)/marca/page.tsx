'use client';

import { uploadFile } from '@vetta/sdk';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import { brandThemeVars, type BrandColorsCheck } from '@vetta/tokens';
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
  LockedFeature,
  Uploader,
} from '@vetta/ui';
import { CheckCircle2, Copy, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface BrandSettings {
  displayName: string | null;
  defaultName: string;
  slug: string;
  logoMediaId: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  emailFromName: string | null;
  contrast: BrandColorsCheck;
  whiteLabel: boolean;
  customDomainEnabled: boolean;
  domain: {
    domain: string;
    status: 'PENDING' | 'VERIFYING' | 'ACTIVE' | 'FAILED' | null;
    error: string | null;
    checkedAt: string | null;
    dns: { type: string; name: string; value: string };
  } | null;
  dnsTarget: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  label,
  value,
  onChange,
  check,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  check: BrandColorsCheck['primary'];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        hint="Formato #RRGGBB"
        error={check && !check.ok ? `Contraste ${check.ratio}:1, abaixo do mínimo AA.` : undefined}
      >
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} (seletor)`}
            className="size-11 cursor-pointer rounded-control border border-border bg-transparent"
            value={HEX.test(value) ? value : '#2F5BFF'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
          <Input value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} />
        </div>
      </Field>
      {check?.ok ? (
        <p className="flex items-center gap-1 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden /> Contraste {check.ratio}:1 (AA)
        </p>
      ) : null}
      {check && !check.ok && check.suggestion ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onChange(check.suggestion!)}
          className="self-start"
        >
          <span
            aria-hidden
            className="size-4 rounded-full border border-border"
            style={{ background: check.suggestion }}
          />
          Usar {check.suggestion} (passa no AA)
        </Button>
      ) : null}
    </div>
  );
}

/** White label: nome, logo, cores com contraste AA, remetente de e-mail e domínio próprio. */
export default function BrandPage() {
  const { tenantId } = useActiveTenant();
  const client = useVettaClient();
  const feature = useFeature(tenantId, 'brand.white_label');
  const settings = useApi<BrandSettings>('/v1/brand/settings', { enabled: !feature.loading });
  const [f, setF] = useState({
    displayName: '',
    primaryColor: '',
    accentColor: '',
    emailFromName: '',
  });
  const [check, setCheck] = useState<BrandColorsCheck | null>(null);
  const [domain, setDomain] = useState('');

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setF({
      displayName: s.displayName ?? '',
      primaryColor: s.primaryColor ?? '',
      accentColor: s.accentColor ?? '',
      emailFromName: s.emailFromName ?? '',
    });
    setDomain(s.domain?.domain ?? '');
  }, [settings.data]);

  // Validação de contraste em tempo real (mesma regra da API).
  useEffect(() => {
    const body = {
      primaryColor: HEX.test(f.primaryColor) ? f.primaryColor : null,
      accentColor: HEX.test(f.accentColor) ? f.accentColor : null,
    };
    const t = setTimeout(() => {
      void client
        .request<BrandColorsCheck>('POST', '/v1/brand/check-colors', body)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 250);
    return () => clearTimeout(t);
  }, [f.primaryColor, f.accentColor, client]);

  const save = useApiMutation<object>('PUT', '/v1/brand/settings', {
    invalidate: ['/v1/brand'],
    success: 'Marca atualizada. Seus alunos já veem as novas cores.',
  });
  const setDomainM = useApiMutation<{ domain: string }>('PUT', '/v1/brand/domain', {
    invalidate: ['/v1/brand/settings'],
  });
  const verify = useApiMutation<undefined>('POST', '/v1/brand/domain/verify', {
    invalidate: ['/v1/brand/settings'],
  });
  const removeDomain = useApiMutation<undefined>('DELETE', '/v1/brand/domain', {
    invalidate: ['/v1/brand/settings'],
    success: 'Domínio removido.',
  });

  const s = settings.data;
  const preview = brandThemeVars({
    primaryColor: check?.primary?.ok ? f.primaryColor : null,
    accentColor: check?.accent?.ok ? f.accentColor : null,
  }).light as CSSProperties;
  const domainStatus = s?.domain?.status;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Minha marca</h1>
        <p className="text-muted-foreground">
          O app do aluno, os e-mails, os PDFs e a página de vendas usam a sua marca, com um rodapé
          discreto “feito com Vetta”.
        </p>
      </div>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="White label"
        requiredPlan="PRO_PLUS"
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Identidade</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({
                    displayName: f.displayName || null,
                    primaryColor: f.primaryColor || null,
                    accentColor: f.accentColor || null,
                    emailFromName: f.emailFromName || null,
                  });
                }}
              >
                <Field label="Nome exibido" hint={`Padrão: ${s?.defaultName ?? ''}`}>
                  <Input
                    maxLength={60}
                    value={f.displayName}
                    onChange={(e) => setF({ ...f, displayName: e.target.value })}
                  />
                </Field>
                <Field label="Remetente dos e-mails" hint="Ex.: Studio Ana">
                  <Input
                    maxLength={60}
                    value={f.emailFromName}
                    onChange={(e) => setF({ ...f, emailFromName: e.target.value })}
                  />
                </Field>
                <ColorField
                  label="Cor principal (botões e links)"
                  value={f.primaryColor}
                  onChange={(v) => setF({ ...f, primaryColor: v })}
                  check={check?.primary ?? null}
                />
                <ColorField
                  label="Cor de destaque (conquistas)"
                  value={f.accentColor}
                  onChange={(v) => setF({ ...f, accentColor: v })}
                  check={check?.accent ?? null}
                />
                <div className="sm:col-span-2">
                  <Button type="submit" loading={save.isPending} disabled={check?.ok === false}>
                    Salvar marca
                  </Button>
                </div>
              </form>
              <div className="mt-6">
                <h2 className="mb-2 font-semibold">Logo</h2>
                <Uploader
                  accept="image/png,image/jpeg,image/svg+xml"
                  maxBytes={5 * 1024 * 1024}
                  label="Enviar logo (PNG, JPG ou SVG)"
                  upload={({ file, onProgress, signal }) =>
                    uploadFile(client, file, {
                      purpose: 'brand_logo',
                      signal,
                      onProgress: (x) => onProgress(x.ratio),
                    })
                  }
                  onUploaded={(mediaId) => save.mutate({ logoMediaId: mediaId })}
                />
              </div>
            </CardContent>
          </Card>

          <Card style={preview}>
            <CardHeader>
              <CardTitle>Prévia no app do aluno</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="font-display text-xl">{f.displayName || s?.defaultName}</p>
              <Button variant="action">Começar treino</Button>
              <a href="#" className="text-link underline" onClick={(e) => e.preventDefault()}>
                Ver histórico
              </a>
              <span className="self-start rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
                Novo recorde!
              </span>
              <p className="text-xs text-muted-foreground">feito com Vetta</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Domínio próprio</CardTitle>
            <CardDescription>
              Use um subdomínio seu, como app.seudominio.com.br. O certificado de segurança é
              emitido automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <LockedFeature
              locked={!s?.customDomainEnabled}
              loading={!s}
              title="Domínio próprio"
              requiredPlan="PRO_PLUS"
            >
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setDomainM.mutate({ domain });
                }}
              >
                <Field label="Domínio" className="min-w-64 flex-1">
                  <Input
                    required
                    placeholder="app.seudominio.com.br"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                </Field>
                <Button type="submit" loading={setDomainM.isPending}>
                  Salvar domínio
                </Button>
              </form>
              {s?.domain ? (
                <div className="flex flex-col gap-3 rounded-card border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.domain.domain}</span>
                    {domainStatus === 'ACTIVE' ? (
                      <Badge variant="success">ativo com HTTPS</Badge>
                    ) : domainStatus === 'FAILED' ? (
                      <Badge variant="danger">falhou</Badge>
                    ) : (
                      <Badge variant="warning">aguardando DNS</Badge>
                    )}
                    {s.domain.checkedAt ? (
                      <span className="text-sm text-muted-foreground">
                        verificado em {fmtDateTime(s.domain.checkedAt)}
                      </span>
                    ) : null}
                  </div>
                  {domainStatus !== 'ACTIVE' ? (
                    <>
                      <p className="text-sm">
                        No painel do seu provedor de domínio, crie este registro:
                      </p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-control bg-muted p-3 font-mono text-sm">
                        <dt>Tipo</dt>
                        <dd>{s.domain.dns.type}</dd>
                        <dt>Nome</dt>
                        <dd className="break-all">{s.domain.dns.name}</dd>
                        <dt>Valor</dt>
                        <dd className="flex items-center gap-2 break-all">
                          {s.domain.dns.value}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Copiar valor do CNAME"
                            onClick={() => void navigator.clipboard.writeText(s.domain!.dns.value)}
                          >
                            <Copy aria-hidden />
                          </Button>
                        </dd>
                      </dl>
                      {s.domain.error ? (
                        <p className="flex items-center gap-1 text-sm text-danger">
                          <TriangleAlert className="size-4" aria-hidden /> {s.domain.error}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">
                        A propagação pode levar algumas horas. Verificamos sozinhos a cada 10
                        minutos.
                      </p>
                    </>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {domainStatus !== 'ACTIVE' ? (
                      <Button
                        variant="secondary"
                        loading={verify.isPending}
                        onClick={() => verify.mutate(undefined)}
                      >
                        <RefreshCw aria-hidden /> Verificar agora
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm('Remover o domínio próprio?')) removeDomain.mutate(undefined);
                      }}
                    >
                      Remover domínio
                    </Button>
                  </div>
                </div>
              ) : null}
            </LockedFeature>
          </CardContent>
        </Card>
      </LockedFeature>
    </div>
  );
}
