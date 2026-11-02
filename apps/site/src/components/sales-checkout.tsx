'use client';

import { PAYMENT_METHOD_LABEL } from '@vetta/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vetta/ui';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_URL, brl, PUBLIC_API_URL, type SalesPagePlan } from '@/lib/data';

interface Status {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  method: string;
  amountCents: number;
  pix: { copyPaste: string; qrCode: string | null } | null;
  boletoUrl: string | null;
  invoiceUrl: string | null;
  failureReason: string | null;
  next: string | null;
}

/**
 * Checkout da página de vendas: o comprador paga (Pix, boleto ou cartão) e, com o
 * pagamento confirmado, vira aluno e recebe o convite por e-mail automaticamente.
 */
export function Checkout({
  slug,
  plan,
  personalName,
}: {
  slug: string;
  plan: SalesPagePlan;
  personalName: string;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    cpfCnpj: '',
    method: plan.methods[0] ?? 'PIX',
    installments: 1,
    terms: false,
  });
  const [card, setCard] = useState({
    holderName: '',
    number: '',
    expiryMonth: '',
    expiryYear: '',
    ccv: '',
    postalCode: '',
    addressNumber: '',
  });
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Pix e boleto: acompanha até o pagamento cair.
  useEffect(() => {
    if (!status || status.status !== 'PENDING') return;
    const t = setInterval(async () => {
      const r = await fetch(`${PUBLIC_API_URL}/v1/public/checkouts/${status.id}`).catch(() => null);
      if (r?.ok) setStatus((await r.json()) as Status);
    }, 5000);
    return () => clearInterval(t);
  }, [status]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        consultingPlanId: plan.id,
        name: f.name,
        email: f.email,
        phone: f.phone,
        cpfCnpj: f.cpfCnpj,
        method: f.method,
        installments: plan.paymentMode === 'INSTALLMENTS' ? f.installments : 1,
        acceptTerms: f.terms,
        ...(f.method === 'CREDIT_CARD'
          ? {
              card: {
                holderName: card.holderName,
                number: card.number,
                expiryMonth: card.expiryMonth,
                expiryYear: card.expiryYear,
                ccv: card.ccv,
              },
              cardHolder: {
                name: f.name,
                email: f.email,
                cpfCnpj: f.cpfCnpj,
                postalCode: card.postalCode,
                addressNumber: card.addressNumber,
                phone: f.phone,
              },
            }
          : {}),
      };
      const r = await fetch(`${PUBLIC_API_URL}/v1/public/pages/${slug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await r.json()) as Status & { message?: string };
      if (!r.ok) throw new Error(json.message ?? 'Não foi possível concluir. Tente de novo.');
      setStatus(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="accent" className="w-full" onClick={() => setOpen(true)}>
        Contratar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{plan.name}</DialogTitle>
            <DialogDescription>
              {brl(plan.priceCents)} · com {personalName}. Pagamento processado pelo Asaas.
            </DialogDescription>
          </DialogHeader>
          {status?.status === 'PAID' ? (
            <div className="flex flex-col gap-3">
              <p className="text-lg font-semibold text-success">
                Pagamento confirmado! Bem-vindo(a).
              </p>
              <p>
                Enviamos para {f.email || 'seu e-mail'} o convite para criar sua senha e baixar o
                app. Se você já tem conta na Vetta, é só entrar.
              </p>
              <Button asChild variant="accent">
                <a href={status.next ?? `${APP_URL}/entrar`}>Entrar no app</a>
              </Button>
            </div>
          ) : status?.status === 'PENDING' ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              {status.pix ? (
                <>
                  {status.pix.qrCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`data:image/png;base64,${status.pix.qrCode}`}
                      alt="QR Code do Pix"
                      className="mx-auto size-48 bg-white p-2"
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={status.pix.copyPaste}
                      aria-label="Pix copia e cola"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void navigator.clipboard.writeText(status.pix!.copyPaste)}
                    >
                      <Copy /> Copiar
                    </Button>
                  </div>
                </>
              ) : null}
              {status.boletoUrl ? (
                <Button asChild variant="secondary">
                  <a href={status.boletoUrl} target="_blank" rel="noreferrer">
                    Abrir boleto
                  </a>
                </Button>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Esta janela atualiza sozinha quando o pagamento for confirmado.
              </p>
            </div>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label="Nome completo" className="sm:col-span-2">
                <Input
                  required
                  autoComplete="name"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                />
              </Field>
              <Field label="Celular">
                <Input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={f.phone}
                  onChange={(e) => setF({ ...f, phone: e.target.value })}
                />
              </Field>
              <Field label="CPF">
                <Input
                  required
                  inputMode="numeric"
                  value={f.cpfCnpj}
                  onChange={(e) => setF({ ...f, cpfCnpj: e.target.value })}
                />
              </Field>
              <Field label="Forma de pagamento">
                <Select
                  value={f.method}
                  onValueChange={(v) => setF({ ...f, method: v as typeof f.method })}
                >
                  <SelectTrigger aria-label="Forma de pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plan.methods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {f.method === 'CREDIT_CARD' ? (
                <>
                  {plan.paymentMode === 'INSTALLMENTS' ? (
                    <Field label="Parcelas" className="sm:col-span-2">
                      <Select
                        value={String(f.installments)}
                        onValueChange={(v) => setF({ ...f, installments: Number(v) })}
                      >
                        <SelectTrigger aria-label="Parcelas">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: plan.maxInstallments }, (_, i) => i + 1).map(
                            (n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}x de {brl(Math.ceil(plan.priceCents / n))}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  <Field label="Nome no cartão" className="sm:col-span-2">
                    <Input
                      required
                      autoComplete="cc-name"
                      value={card.holderName}
                      onChange={(e) => setCard({ ...card, holderName: e.target.value })}
                    />
                  </Field>
                  <Field label="Número do cartão" className="sm:col-span-2">
                    <Input
                      required
                      autoComplete="cc-number"
                      inputMode="numeric"
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: e.target.value })}
                    />
                  </Field>
                  <Field label="Mês (MM)">
                    <Input
                      required
                      autoComplete="cc-exp-month"
                      inputMode="numeric"
                      maxLength={2}
                      value={card.expiryMonth}
                      onChange={(e) => setCard({ ...card, expiryMonth: e.target.value })}
                    />
                  </Field>
                  <Field label="Ano (AAAA)">
                    <Input
                      required
                      autoComplete="cc-exp-year"
                      inputMode="numeric"
                      maxLength={4}
                      value={card.expiryYear}
                      onChange={(e) => setCard({ ...card, expiryYear: e.target.value })}
                    />
                  </Field>
                  <Field label="CVV">
                    <Input
                      required
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      maxLength={4}
                      value={card.ccv}
                      onChange={(e) => setCard({ ...card, ccv: e.target.value })}
                    />
                  </Field>
                  <Field label="CEP">
                    <Input
                      required
                      autoComplete="postal-code"
                      inputMode="numeric"
                      value={card.postalCode}
                      onChange={(e) => setCard({ ...card, postalCode: e.target.value })}
                    />
                  </Field>
                  <Field label="Número do endereço">
                    <Input
                      required
                      value={card.addressNumber}
                      onChange={(e) => setCard({ ...card, addressNumber: e.target.value })}
                    />
                  </Field>
                </>
              ) : null}
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={f.terms}
                  onCheckedChange={(v) => setF({ ...f, terms: !!v })}
                  className="mt-0.5"
                  aria-label="Aceito os termos"
                />
                <span>
                  Li e aceito os{' '}
                  <a href="/termos" className="text-action underline" target="_blank">
                    termos de uso
                  </a>{' '}
                  e a{' '}
                  <a href="/privacidade" className="text-action underline" target="_blank">
                    política de privacidade
                  </a>
                  .
                </span>
              </label>
              {error ? (
                <p role="alert" className="text-sm text-danger sm:col-span-2">
                  {error}
                </p>
              ) : null}
              {status?.status === 'FAILED' ? (
                <p role="alert" className="text-sm text-danger sm:col-span-2">
                  {status.failureReason ?? 'Pagamento não aprovado.'}
                </p>
              ) : null}
              <Button
                type="submit"
                variant="accent"
                loading={busy}
                disabled={!f.terms}
                className="sm:col-span-2"
              >
                Pagar {brl(plan.priceCents)}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
