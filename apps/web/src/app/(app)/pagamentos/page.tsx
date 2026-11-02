'use client';

import { CYCLE_LABEL, PAYMENT_MODE_LABEL } from '@vetta/contracts';
import { useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@vetta/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  CardForm,
  InvoiceStatus,
  PayLinks,
  PixBox,
  type CardData,
} from '@/components/pro/payments';
import { brl, errorMessage, fmtDate, useApi } from '@/lib/api';

interface Invoice {
  id: string;
  description: string;
  amountCents: number;
  status: string;
  method: string | null;
  dueDate: string;
  paidAt: string | null;
  invoiceUrl: string | null;
  boletoUrl: string | null;
  pix: { copyPaste: string; qrCode: string | null } | null;
  installment: { number: number; count: number } | null;
}
interface Mine {
  blocked: boolean;
  subscriptions: {
    id: string;
    status: string;
    plan: { name: string; cycle: keyof typeof CYCLE_LABEL; benefits: string[] };
    priceCents: number;
    paymentMode: keyof typeof PAYMENT_MODE_LABEL;
    endsAt: string | null;
    canceledAt: string | null;
  }[];
  invoices: Invoice[];
}

function PayDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useVettaClient();
  const qc = useQueryClient();
  const inv = useApi<Invoice>(`/v1/me/finance/invoices/${id}`);
  const [card, setCard] = useState<CardData | null>(null);
  const [busy, setBusy] = useState(false);
  if (!inv.data) return <Skeleton className="h-48" />;
  const pay = async () => {
    if (!card) return;
    setBusy(true);
    try {
      const r = await client.request<Invoice>(
        'POST',
        `/v1/me/finance/invoices/${id}/pay-card`,
        card,
      );
      if (r.status === 'PAID') {
        toast.success('Pagamento aprovado. Obrigado!');
        await qc.invalidateQueries();
        onClose();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">
        {inv.data.description} · <strong>{brl(inv.data.amountCents)}</strong> · vence{' '}
        {fmtDate(inv.data.dueDate)}
      </p>
      <Tabs defaultValue={inv.data.pix ? 'pix' : inv.data.boletoUrl ? 'boleto' : 'cartao'}>
        <TabsList>
          <TabsTrigger value="pix">Pix</TabsTrigger>
          <TabsTrigger value="boleto">Boleto</TabsTrigger>
          <TabsTrigger value="cartao">Cartão</TabsTrigger>
        </TabsList>
        <TabsContent value="pix">
          {inv.data.pix ? (
            <PixBox pix={inv.data.pix} />
          ) : (
            <PayLinks invoiceUrl={inv.data.invoiceUrl} />
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            A confirmação do Pix chega em segundos e libera seu acesso na hora.
          </p>
        </TabsContent>
        <TabsContent value="boleto">
          <PayLinks boletoUrl={inv.data.boletoUrl} invoiceUrl={inv.data.invoiceUrl} />
          <p className="mt-2 text-sm text-muted-foreground">
            O boleto pode levar até 3 dias úteis para compensar.
          </p>
        </TabsContent>
        <TabsContent value="cartao" className="flex flex-col gap-3">
          <CardForm onChange={setCard} />
          <Button variant="accent" loading={busy} disabled={!card} onClick={() => void pay()}>
            Pagar {brl(inv.data.amountCents)}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Aluno: planos contratados, cobranças e pagamento (liberado mesmo com acesso pausado). */
export default function PaymentsPage() {
  const mine = useApi<Mine>('/v1/me/finance');
  const [paying, setPaying] = useState<string | null>(null);
  if (!mine.data) return <Skeleton className="h-64" />;
  const open = mine.data.invoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Pagamentos</h1>
      {mine.data.blocked ? (
        <div role="alert" className="rounded-card border border-danger bg-danger/10 p-4">
          <p className="font-semibold">Seu acesso aos treinos está pausado.</p>
          <p>
            Há uma cobrança em aberto. Assim que o pagamento for confirmado, tudo volta na hora.
          </p>
        </div>
      ) : null}
      {open.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Em aberto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {open.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3"
              >
                <span className="flex-1">
                  {i.description}
                  {i.installment ? ` (${i.installment.number}/${i.installment.count})` : ''}
                </span>
                <span>vence {fmtDate(i.dueDate)}</span>
                <span className="font-semibold tabular-nums">{brl(i.amountCents)}</span>
                <InvoiceStatus status={i.status} />
                <Button variant="accent" onClick={() => setPaying(i.id)}>
                  Pagar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Meus planos</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.data.subscriptions.length ? (
            <ul className="flex flex-col gap-3">
              {mine.data.subscriptions.map((s) => (
                <li key={s.id} className="rounded-control border border-border p-3">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {s.plan.name}
                    <Badge
                      variant={
                        s.status === 'ACTIVE'
                          ? 'success'
                          : s.status === 'OVERDUE'
                            ? 'danger'
                            : 'outline'
                      }
                    >
                      {s.status === 'ACTIVE'
                        ? 'ativo'
                        : s.status === 'OVERDUE'
                          ? 'em atraso'
                          : s.status === 'PENDING'
                            ? 'aguardando pagamento'
                            : 'encerrado'}
                    </Badge>
                  </p>
                  <p className="text-sm">
                    {brl(s.priceCents)} / {CYCLE_LABEL[s.plan.cycle].toLowerCase()} ·{' '}
                    {PAYMENT_MODE_LABEL[s.paymentMode]}
                    {s.endsAt ? ` · vale até ${fmtDate(s.endsAt)}` : ''}
                  </p>
                  {s.plan.benefits.length ? (
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      {s.plan.benefits.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Wallet />}
              title="Nenhum plano contratado"
              description="Quando seu personal enviar uma cobrança, ela aparece aqui."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border text-sm">
            {mine.data.invoices
              .filter((i) => !open.includes(i))
              .map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex-1">{i.description}</span>
                  <span>{fmtDate(i.paidAt ?? i.dueDate)}</span>
                  <span className="tabular-nums">{brl(i.amountCents)}</span>
                  <InvoiceStatus status={i.status} />
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pagar cobrança</DialogTitle>
          </DialogHeader>
          {paying ? <PayDialog id={paying} onClose={() => setPaying(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
