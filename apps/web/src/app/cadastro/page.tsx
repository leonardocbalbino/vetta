'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterPersonalSchema } from '@vetta/contracts';
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
  toast,
} from '@vetta/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { type z } from 'zod';

const schema = RegisterPersonalSchema.pick({
  name: true,
  email: true,
  password: true,
  businessName: true,
  acceptTerms: true,
});
type Form = z.input<typeof schema>;

/** Cadastro do personal: 14 dias de Pro Plus, sem cartão. */
export default function SignupPage() {
  const client = useVettaClient();
  const router = useRouter();
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  const e = form.formState.errors;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <Logo />
          <h1 className="font-display text-2xl">Comece grátis</h1>
          <p className="text-muted-foreground">14 dias do plano Pro Plus, sem cartão de crédito.</p>
        </CardHeader>
        <CardContent>
          <form
            method="post"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(async (v) => {
              try {
                await client.auth.register({
                  ...v,
                  acceptTerms: true,
                  locale: 'pt-BR',
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  acceptHealthDataConsent: false,
                });
                router.replace('/inicio');
              } catch (err) {
                toast.error(
                  err instanceof ApiRequestError ? err.message : 'Não foi possível criar a conta.',
                );
              }
            })}
          >
            <Field label="Seu nome" error={e.name?.message}>
              <Input autoComplete="name" {...form.register('name')} />
            </Field>
            <Field
              label="Nome do seu negócio"
              error={e.businessName?.message}
              hint="Aparece para seus alunos."
            >
              <Input {...form.register('businessName')} />
            </Field>
            <Field label="E-mail" error={e.email?.message}>
              <Input type="email" autoComplete="email" {...form.register('email')} />
            </Field>
            <Field
              label="Senha"
              error={e.password?.message}
              hint="Mínimo de 8 caracteres, com letra e número."
            >
              <Input type="password" autoComplete="new-password" {...form.register('password')} />
            </Field>
            <Controller
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={field.value === true}
                    onCheckedChange={(v) => field.onChange(v === true ? true : undefined)}
                    aria-label="Aceito os termos"
                    className="mt-0.5"
                  />
                  <span>
                    Li e aceito os{' '}
                    <a
                      href="https://vettafit.com.br/termos"
                      target="_blank"
                      rel="noreferrer"
                      className="text-link underline"
                    >
                      termos de uso
                    </a>{' '}
                    e a{' '}
                    <a
                      href="https://vettafit.com.br/privacidade"
                      target="_blank"
                      rel="noreferrer"
                      className="text-link underline"
                    >
                      política de privacidade
                    </a>
                    .
                  </span>
                </label>
              )}
            />
            {e.acceptTerms ? <p className="text-sm text-danger">{e.acceptTerms.message}</p> : null}
            <Button type="submit" variant="accent" loading={form.formState.isSubmitting}>
              Criar minha conta
            </Button>
            <p className="text-center text-sm">
              Já tem conta?{' '}
              <Link href="/entrar" className="text-link hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
