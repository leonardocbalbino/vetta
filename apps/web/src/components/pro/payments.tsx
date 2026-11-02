'use client';

import { Badge, Button, Field, Input, toast } from '@vetta/ui';
import { Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

export const INVOICE_STATUS: Record<
  string,
  { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'outline' }
> = {
  PENDING: { label: 'Em aberto', variant: 'warning' },
  PAID: { label: 'Pago', variant: 'success' },
  OVERDUE: { label: 'Vencido', variant: 'danger' },
  CANCELED: { label: 'Cancelado', variant: 'outline' },
  REFUNDED: { label: 'Estornado', variant: 'outline' },
};

export function InvoiceStatus({ status }: { status: string }) {
  const s = INVOICE_STATUS[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** QR Code do Pix (imagem do gateway em base64) + copia-e-cola. */
export function PixBox({ pix }: { pix: { copyPaste: string; qrCode: string | null } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border p-4">
      {pix.qrCode ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`data:image/png;base64,${pix.qrCode}`}
          alt="QR Code do Pix"
          className="size-48 rounded-control bg-white p-2"
        />
      ) : null}
      <p className="text-sm text-muted-foreground">Abra o app do seu banco e pague com Pix.</p>
      <div className="flex w-full gap-2">
        <Input
          readOnly
          value={pix.copyPaste}
          aria-label="Pix copia e cola"
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(pix.copyPaste);
            toast.success('Código Pix copiado.');
          }}
        >
          <Copy /> Copiar
        </Button>
      </div>
    </div>
  );
}

export function PayLinks({
  boletoUrl,
  invoiceUrl,
}: {
  boletoUrl?: string | null;
  invoiceUrl?: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {boletoUrl ? (
        <Button asChild variant="secondary">
          <a href={boletoUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Abrir boleto
          </a>
        </Button>
      ) : null}
      {invoiceUrl ? (
        <Button asChild variant="link">
          <a href={invoiceUrl} target="_blank" rel="noreferrer">
            Ver fatura no gateway
          </a>
        </Button>
      ) : null}
    </div>
  );
}

export interface CardData {
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  cardHolder: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
}

const empty: CardData = {
  card: { holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' },
  cardHolder: { name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' },
};

/**
 * Dados do cartão. Vão só para a tokenização no gateway (a Vetta guarda token,
 * bandeira e final). autoComplete ajuda o navegador a preencher com segurança.
 */
export function CardForm({
  onChange,
  defaults,
}: {
  onChange: (d: CardData) => void;
  defaults?: Partial<CardData['cardHolder']>;
}) {
  const [d, setD] = useState<CardData>({
    ...empty,
    cardHolder: { ...empty.cardHolder, ...defaults },
  });
  const set = (part: 'card' | 'cardHolder', k: string, v: string) => {
    const next = { ...d, [part]: { ...d[part], [k]: v } } as CardData;
    setD(next);
    onChange(next);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome impresso no cartão" className="sm:col-span-2">
        <Input
          autoComplete="cc-name"
          required
          value={d.card.holderName}
          onChange={(e) => set('card', 'holderName', e.target.value)}
        />
      </Field>
      <Field label="Número do cartão" className="sm:col-span-2">
        <Input
          autoComplete="cc-number"
          inputMode="numeric"
          required
          value={d.card.number}
          onChange={(e) => set('card', 'number', e.target.value)}
        />
      </Field>
      <Field label="Mês (MM)">
        <Input
          autoComplete="cc-exp-month"
          inputMode="numeric"
          maxLength={2}
          required
          value={d.card.expiryMonth}
          onChange={(e) => set('card', 'expiryMonth', e.target.value)}
        />
      </Field>
      <Field label="Ano (AAAA)">
        <Input
          autoComplete="cc-exp-year"
          inputMode="numeric"
          maxLength={4}
          required
          value={d.card.expiryYear}
          onChange={(e) => set('card', 'expiryYear', e.target.value)}
        />
      </Field>
      <Field label="CVV">
        <Input
          autoComplete="cc-csc"
          inputMode="numeric"
          maxLength={4}
          required
          value={d.card.ccv}
          onChange={(e) => set('card', 'ccv', e.target.value)}
        />
      </Field>
      <Field label="CPF ou CNPJ do titular">
        <Input
          inputMode="numeric"
          required
          value={d.cardHolder.cpfCnpj}
          onChange={(e) => set('cardHolder', 'cpfCnpj', e.target.value)}
        />
      </Field>
      <Field label="Nome do titular">
        <Input
          autoComplete="name"
          required
          value={d.cardHolder.name}
          onChange={(e) => set('cardHolder', 'name', e.target.value)}
        />
      </Field>
      <Field label="E-mail do titular">
        <Input
          type="email"
          autoComplete="email"
          required
          value={d.cardHolder.email}
          onChange={(e) => set('cardHolder', 'email', e.target.value)}
        />
      </Field>
      <Field label="Celular">
        <Input
          type="tel"
          autoComplete="tel"
          required
          value={d.cardHolder.phone}
          onChange={(e) => set('cardHolder', 'phone', e.target.value)}
        />
      </Field>
      <Field label="CEP">
        <Input
          autoComplete="postal-code"
          inputMode="numeric"
          required
          value={d.cardHolder.postalCode}
          onChange={(e) => set('cardHolder', 'postalCode', e.target.value)}
        />
      </Field>
      <Field label="Número do endereço">
        <Input
          required
          value={d.cardHolder.addressNumber}
          onChange={(e) => set('cardHolder', 'addressNumber', e.target.value)}
        />
      </Field>
    </div>
  );
}
