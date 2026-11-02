import { Button, Card, Input, Text, useTheme } from '@vetta/ui-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';

interface Invoice {
  id: string;
  description: string;
  amountCents: number;
  status: string;
  dueDate: string;
  invoiceUrl: string | null;
  boletoUrl: string | null;
  pix: { copyPaste: string; qrCode: string | null } | null;
}
interface Mine {
  blocked: boolean;
  subscriptions: {
    id: string;
    status: string;
    plan: { name: string };
    priceCents: number;
    endsAt: string | null;
  }[];
  invoices: Invoice[];
}

const brl = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR');
const STATUS: Record<string, string> = {
  PENDING: 'em aberto',
  OVERDUE: 'vencida',
  PAID: 'paga',
  CANCELED: 'cancelada',
  REFUNDED: 'estornada',
};

const emptyCard = {
  holderName: '',
  number: '',
  expiryMonth: '',
  expiryYear: '',
  ccv: '',
  cpfCnpj: '',
  email: '',
  phone: '',
  postalCode: '',
  addressNumber: '',
};

/** Pix (QR e copia-e-cola), boleto ou cartão para uma cobrança do personal. */
function PayInvoice({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTheme();
  const inv = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => client.request<Invoice>('GET', `/v1/me/finance/invoices/${id}`),
  });
  const [card, setCard] = useState(emptyCard);
  const [useCard, setUseCard] = useState(false);
  const pay = useMutation({
    mutationFn: () =>
      client.request<Invoice>('POST', `/v1/me/finance/invoices/${id}/pay-card`, {
        card: {
          holderName: card.holderName,
          number: card.number,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        cardHolder: {
          name: card.holderName,
          email: card.email,
          cpfCnpj: card.cpfCnpj,
          postalCode: card.postalCode,
          addressNumber: card.addressNumber,
          phone: card.phone,
        },
      }),
    onSuccess: (r) => {
      if (r.status === 'PAID') {
        Alert.alert('Pagamento aprovado', 'Obrigado! Seu acesso já está liberado.');
        onDone();
      }
    },
    onError: (e) => Alert.alert('Pagamento não aprovado', (e as Error).message),
  });
  if (!inv.data) return <Text muted>Carregando…</Text>;
  const i = inv.data;
  const field = (k: keyof typeof card, label: string, numeric = false) => (
    <Input
      label={label}
      value={card[k]}
      keyboardType={numeric ? 'number-pad' : 'default'}
      onChangeText={(v) => setCard({ ...card, [k]: v })}
    />
  );
  return (
    <View style={{ gap: t.spacing[3] }}>
      {i.pix ? (
        <>
          {i.pix.qrCode ? (
            <Image
              source={{ uri: `data:image/png;base64,${i.pix.qrCode}` }}
              accessibilityLabel="QR Code do Pix"
              style={{ width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff' }}
            />
          ) : null}
          <Button
            title="Copiar código Pix"
            variant="accent"
            onPress={() =>
              void Clipboard.setStringAsync(i.pix!.copyPaste).then(() =>
                Alert.alert('Copiado', 'Cole no app do seu banco.'),
              )
            }
          />
        </>
      ) : null}
      {i.boletoUrl ? (
        <Button
          title="Abrir boleto"
          variant="secondary"
          onPress={() => void WebBrowser.openBrowserAsync(i.boletoUrl!)}
        />
      ) : null}
      <Button
        title={useCard ? 'Pagar com Pix ou boleto' : 'Pagar com cartão'}
        variant="ghost"
        onPress={() => setUseCard(!useCard)}
      />
      {useCard ? (
        <>
          {field('holderName', 'Nome no cartão')}
          {field('number', 'Número do cartão', true)}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('expiryMonth', 'Mês (MM)', true)}</View>
            <View style={{ flex: 1 }}>{field('expiryYear', 'Ano (AAAA)', true)}</View>
            <View style={{ flex: 1 }}>{field('ccv', 'CVV', true)}</View>
          </View>
          {field('cpfCnpj', 'CPF do titular', true)}
          {field('email', 'E-mail')}
          {field('phone', 'Celular', true)}
          {field('postalCode', 'CEP', true)}
          {field('addressNumber', 'Número do endereço')}
          <Button
            title={`Pagar ${brl(i.amountCents)}`}
            variant="accent"
            loading={pay.isPending}
            onPress={() => pay.mutate()}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * Aluno paga o personal. É serviço de pessoa para pessoa, então o pagamento no app é
 * permitido pelas lojas (ADR-010). Fica liberado mesmo com o acesso pausado por atraso.
 */
export default function Payments() {
  const t = useTheme();
  const qc = useQueryClient();
  const { active } = useSession();
  const mine = useQuery({
    queryKey: ['my-finance', active?.tenantId],
    queryFn: () => client.request<Mine>('GET', '/v1/me/finance'),
  });
  const [open, setOpen] = useState<string | null>(null);
  const openInvoices = (mine.data?.invoices ?? []).filter(
    (i) => i.status === 'PENDING' || i.status === 'OVERDUE',
  );
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
    >
      <Stack.Screen options={{ title: 'Pagamentos' }} />
      {mine.data?.blocked ? (
        <Card>
          <Text variant="title">Seu acesso está pausado</Text>
          <Text>
            Há uma cobrança em aberto com seu personal. Assim que o pagamento for confirmado, os
            treinos voltam na hora.
          </Text>
        </Card>
      ) : null}
      {openInvoices.map((i) => (
        <Card key={i.id}>
          <Text variant="title">{i.description}</Text>
          <Text>
            {brl(i.amountCents)} · vence {day(i.dueDate)} · {STATUS[i.status]}
          </Text>
          {open === i.id ? (
            <PayInvoice
              id={i.id}
              onDone={() => {
                setOpen(null);
                void qc.invalidateQueries();
              }}
            />
          ) : (
            <Button title="Pagar" variant="accent" onPress={() => setOpen(i.id)} />
          )}
        </Card>
      ))}
      <Card>
        <Text variant="title">Meus planos</Text>
        {(mine.data?.subscriptions ?? []).map((s) => (
          <Text key={s.id}>
            {s.plan.name} · {brl(s.priceCents)}
            {s.endsAt ? ` · até ${new Date(s.endsAt).toLocaleDateString('pt-BR')}` : ''}
          </Text>
        ))}
        {!mine.data?.subscriptions.length ? <Text muted>Nenhum plano contratado.</Text> : null}
      </Card>
      <Card>
        <Text variant="title">Histórico</Text>
        {(mine.data?.invoices ?? [])
          .filter((i) => !openInvoices.includes(i))
          .map((i) => (
            <Text key={i.id}>
              {day(i.dueDate)} · {i.description} · {brl(i.amountCents)} · {STATUS[i.status]}
            </Text>
          ))}
      </Card>
    </ScrollView>
  );
}
