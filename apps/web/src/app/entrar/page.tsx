'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ApiRequestError } from '@vetta/sdk';
import { useVettaClient } from '@vetta/sdk/react';
import { Button, Card, CardContent, CardHeader, Field, Input, Logo, toast } from '@vetta/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const schema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useTranslations('auth');
  const client = useVettaClient();
  const router = useRouter();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const form = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const r = await client.auth.login(v.email, v.password, {
        platform: 'WEB',
        deviceName: navigator.userAgent.slice(0, 60),
      });
      if ('twoFactorRequired' in r) setChallenge(r.challengeToken);
      else router.replace('/inicio');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('invalid'));
    }
  });

  const onTwoFactor = async () => {
    try {
      await client.auth.loginTwoFactor(challenge!, code);
      router.replace('/inicio');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Código inválido.');
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <Logo />
          <div>
            <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
            <p className="text-muted-foreground">{t('subtitle')}</p>
          </div>
        </CardHeader>
        <CardContent>
          {challenge ? (
            <div className="flex flex-col gap-4">
              <Field label={t('twoFactor')} hint={t('twoFactorHint')}>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <Button onClick={onTwoFactor}>{t('submit')}</Button>
            </div>
          ) : (
            <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <Field label={t('email')} error={form.formState.errors.email?.message}>
                <Input type="email" autoComplete="email" {...form.register('email')} />
              </Field>
              <Field label={t('password')} error={form.formState.errors.password?.message}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...form.register('password')}
                />
              </Field>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t('submit')}
              </Button>
              <Button
                type="button"
                variant="link"
                onClick={async () => {
                  const email = form.getValues('email');
                  if (!email) return form.setFocus('email');
                  await client.auth.magicLink(email);
                  toast.success('Se o e-mail existir, enviamos um link de acesso.');
                }}
              >
                {t('magicLink')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
