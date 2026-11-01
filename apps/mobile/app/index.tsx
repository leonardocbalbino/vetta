import { ApiRequestError } from '@vetta/sdk';
import { useEntitlements, useFeature, useMe } from '@vetta/sdk/react';
import {
  Button,
  Card,
  Input,
  LockedFeature,
  Logo,
  PlanBadge,
  Skeleton,
  Text,
  useTheme,
} from '@vetta/ui-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client, setActiveTenant } from '../src/lib/client';
import { useUpload } from '../src/lib/use-upload';

function Login({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const r = await client.auth.login(email.trim(), password, {
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
      });
      if ('twoFactorRequired' in r)
        setError('Conta com 2FA: conclua o login pelo app web nesta fase.');
      else onDone();
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : 'Não foi possível entrar. Verifique sua conexão.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: t.spacing[6], gap: t.spacing[4] }}
    >
      <Logo />
      <Text variant="display">Entre na sua conta</Text>
      <Input
        label="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        label="Senha"
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
        {...(error ? { error } : {})}
      />
      <Button title="Entrar" variant="accent" loading={busy} onPress={submit} />
    </KeyboardAvoidingView>
  );
}

function Home({ onLogout }: { onLogout: () => void }) {
  const t = useTheme();
  const me = useMe();
  const tenantId = me.data?.memberships[0]?.tenantId ?? null;
  useEffect(() => setActiveTenant(tenantId), [tenantId]);
  const ent = useEntitlements(tenantId);
  const photos = useFeature(tenantId, 'progress.photos');
  const uploads = useUpload();

  if (!me.data) {
    return (
      <View style={{ padding: t.spacing[6], gap: t.spacing[3] }}>
        <Skeleton height={32} width="60%" />
        <Skeleton height={120} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ padding: t.spacing[6], gap: t.spacing[4] }}>
      <Logo />
      <Text variant="display">Olá, {me.data.name.split(' ')[0]}!</Text>
      <Card>
        <Text variant="title">{me.data.memberships[0]?.tenantName ?? 'Sem vínculo ativo'}</Text>
        {ent.data ? <PlanBadge plan={ent.data.plan.code} /> : null}
      </Card>
      <LockedFeature
        locked={photos.locked}
        title="Fotos de progresso"
        requiredPlan="PRO"
        onUpgrade={() => undefined}
      >
        <Card>
          <Text variant="title">Fotos de progresso</Text>
          <Text muted>
            {uploads.items.length
              ? `${uploads.items.length} envio(s) na fila`
              : 'Nenhum envio pendente.'}
          </Text>
        </Card>
      </LockedFeature>
      <Button
        title="Sair"
        variant="secondary"
        onPress={async () => {
          await client.auth.logout();
          onLogout();
        }}
      />
    </ScrollView>
  );
}

export default function Index() {
  const t = useTheme();
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking');

  useEffect(() => {
    void (async () => {
      const tokens = await client.tokens.get();
      if (!tokens) return setState('out');
      // Biometria para reabrir o app com sessão salva (quando disponível).
      const hasBio =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      if (hasBio) {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Entrar na Vetta' });
        if (!r.success) return setState('out');
      }
      setState('in');
    })();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      {state === 'checking' ? null : state === 'out' ? (
        <Login onDone={() => setState('in')} />
      ) : (
        <Home onLogout={() => setState('out')} />
      )}
    </SafeAreaView>
  );
}
