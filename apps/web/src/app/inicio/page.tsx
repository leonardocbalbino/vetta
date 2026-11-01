'use client';

import type { Membership } from '@vetta/contracts';
import { uploadFile } from '@vetta/sdk';
import { useEntitlements, useFeature, useMe, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LockedFeature,
  Logo,
  PlanBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  Uploader,
} from '@vetta/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useActiveTenant } from '@/lib/session';

const ROLE_LABEL: Record<Membership['role'], string> = {
  PERSONAL: 'Personal',
  PERSONAL_ASSISTENTE: 'Assistente',
  ALUNO: 'Aluno',
};

export default function HomePage() {
  const t = useTranslations('home');
  const router = useRouter();
  const client = useVettaClient();
  const me = useMe();
  const { tenantId, setTenantId } = useActiveTenant();
  const ent = useEntitlements(tenantId);
  const videos = useFeature(tenantId, 'library.custom_videos');

  useEffect(() => {
    if (me.isError) router.replace('/entrar');
    const first = me.data?.memberships[0];
    if (first && !me.data?.memberships.some((m) => m.tenantId === tenantId))
      setTenantId(first.tenantId);
  }, [me.data, me.isError, tenantId, setTenantId, router]);

  if (me.isLoading || !me.data) {
    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
      </main>
    );
  }
  const active = me.data.memberships.find((m) => m.tenantId === tenantId);
  const isStaff = active && active.role !== 'ALUNO';

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      {me.data.impersonatedBy ? (
        <div
          role="alert"
          className="rounded-control bg-warning p-3 text-sm font-semibold text-warning-foreground"
        >
          Você está vendo esta conta como suporte Vetta. Toda ação é registrada.
        </div>
      ) : null}
      <header className="flex items-center justify-between">
        <Logo />
        <Button
          variant="ghost"
          onClick={async () => {
            await client.auth.logout();
            router.replace('/entrar');
          }}
        >
          {t('logout')}
        </Button>
      </header>

      <section className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold">
          {t('hello', { name: me.data.name.split(' ')[0] ?? '' })}
        </h1>
        {!me.data.emailVerified ? (
          <p className="text-sm text-muted-foreground">{t('verifyEmail')}</p>
        ) : null}
      </section>

      {me.data.memberships.length > 1 ? (
        <div className="flex max-w-sm flex-col gap-2">
          <span className="text-sm font-medium">{t('profile')}</span>
          <Select value={tenantId ?? undefined} onValueChange={setTenantId}>
            <SelectTrigger aria-label={t('profile')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {me.data.memberships.map((m) => (
                <SelectItem key={m.tenantId} value={m.tenantId}>
                  {m.tenantName} · {ROLE_LABEL[m.role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('plan')} {ent.data ? <PlanBadge plan={ent.data.plan.code} /> : null}
            {ent.data?.plan.status === 'TRIALING' ? (
              <Badge variant="accent">Teste grátis</Badge>
            ) : null}
          </CardTitle>
          {ent.data?.limits['students.max'] ? (
            <CardDescription>
              Alunos: {ent.data.limits['students.max'].used} de{' '}
              {ent.data.limits['students.max'].max === -1
                ? 'ilimitados'
                : ent.data.limits['students.max'].max}
            </CardDescription>
          ) : null}
        </CardHeader>
      </Card>

      {isStaff && tenantId ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('uploadTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Uploader
                accept="image/jpeg,image/png,image/webp,image/gif"
                maxBytes={10 * 1024 * 1024}
                hint={t('uploadHint')}
                upload={({ file, onProgress, signal, resumeMediaId, onCreated }) =>
                  uploadFile(client, file, {
                    purpose: 'exercise_image',
                    signal,
                    onProgress: (p) => onProgress(p.ratio),
                    ...(resumeMediaId ? { resumeMediaId } : {}),
                    ...(onCreated ? { onCreated } : {}),
                  })
                }
                onUploaded={() => toast.success('Arquivo enviado. Estamos processando.')}
              />
            </CardContent>
          </Card>
          <LockedFeature
            locked={videos.locked}
            title={t('videosTitle')}
            requiredPlan="PRO"
            description="Envie seus próprios vídeos de exercícios com o plano Pro."
          >
            <Card>
              <CardHeader>
                <CardTitle>{t('videosTitle')}</CardTitle>
                <CardDescription>Liberado no seu plano.</CardDescription>
              </CardHeader>
            </Card>
          </LockedFeature>
        </>
      ) : null}
    </main>
  );
}
