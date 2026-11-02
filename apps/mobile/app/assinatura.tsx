import { Button, Card, PlanBadge, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, ScrollView } from 'react-native';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';

interface Subscription {
  status: string;
  plan: { code: 'FREE' | 'PRO' | 'PRO_PLUS'; name: string };
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  checkoutUrl: string;
}

/**
 * Regra das lojas (ADR-010): a assinatura da plataforma é conteúdo digital. O app só
 * abre o checkout web onde a loja permite link externo (flag por plataforma, ligada
 * depois de habilitar o programa de link externo da Apple/Google). Sem a flag, mostra
 * a situação do plano e orienta sem link nem preço.
 */
const EXTERNAL_CHECKOUT =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_EXTERNAL_CHECKOUT_IOS === 'true'
    : process.env.EXPO_PUBLIC_EXTERNAL_CHECKOUT_ANDROID === 'true';

export default function SubscriptionScreen() {
  const t = useTheme();
  const { active } = useSession();
  const sub = useQuery({
    queryKey: ['subscription', active?.tenantId],
    queryFn: () => client.request<Subscription>('GET', '/v1/subscription'),
  });
  const s = sub.data;
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
    >
      <Stack.Screen options={{ title: 'Assinatura' }} />
      {s ? (
        <Card>
          <Text variant="title">Plano atual</Text>
          <PlanBadge plan={s.plan.code} />
          {s.currentPeriodEnd && s.plan.code !== 'FREE' ? (
            <Text muted>
              {s.cancelAtPeriodEnd ? 'Termina' : 'Renova'} em{' '}
              {new Date(s.currentPeriodEnd).toLocaleDateString('pt-BR')}
            </Text>
          ) : null}
          {s.status === 'PAST_DUE' ? (
            <Text>Há uma fatura em atraso. Regularize para manter seu plano.</Text>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Text variant="title">Mudar de plano</Text>
        {EXTERNAL_CHECKOUT && s ? (
          <>
            <Text muted>A troca de plano é feita no site da Vetta.</Text>
            <Button
              title="Ir para vettafit.com.br"
              variant="action"
              onPress={() => void WebBrowser.openBrowserAsync(s.checkoutUrl)}
            />
          </>
        ) : (
          <Text muted>
            A gestão da assinatura é feita pelo computador, entrando na sua conta Vetta.
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}
