import { ApiRequestError } from '@vetta/sdk';
import { Button, Input, Logo, Text, useTheme } from '@vetta/ui-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { client } from '../src/lib/client';
import { useSession } from '../src/lib/session';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const platform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

function GoogleButton({ onToken }: { onToken: (t: string) => void }) {
  const [, response, prompt] = Google.useIdTokenAuthRequest({ clientId: GOOGLE_ID! });
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) onToken(response.params.id_token);
  }, [response, onToken]);
  return <Button title="Entrar com Google" variant="secondary" onPress={() => void prompt()} />;
}

/** Login: senha, Google, Apple e biometria (reabrir com a sessão salva). */
export default function Login() {
  const t = useTheme();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [canBio, setCanBio] = useState(false);

  useEffect(() => {
    void (async () => {
      const has =
        (await client.tokens.get()) &&
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      setCanBio(!!has);
    })();
  }, []);

  const done = async () => {
    await refresh();
    router.replace('/');
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      const r = (await fn()) as { twoFactorRequired?: true; challengeToken?: string } | undefined;
      if (r?.twoFactorRequired) setChallenge(r.challengeToken!);
      else await done();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: t.spacing[6],
            gap: t.spacing[4],
          }}
        >
          <Logo />
          <Text variant="display">
            {challenge ? 'Código de verificação' : 'Entre na sua conta'}
          </Text>
          {challenge ? (
            <>
              <Input
                label="Código de 6 dígitos"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                testID="code"
              />
              <Button
                title="Confirmar"
                variant="accent"
                loading={busy}
                onPress={() => run(() => client.auth.loginTwoFactor(challenge, code))}
              />
            </>
          ) : (
            <>
              <Input
                label="E-mail"
                testID="email"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <Input
                label="Senha"
                testID="password"
                secureTextEntry
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                {...(error ? { error } : {})}
              />
              <Button
                title="Entrar"
                testID="login"
                variant="accent"
                loading={busy}
                onPress={() => run(() => client.auth.login(email.trim(), password, { platform }))}
              />
              {canBio ? (
                <Button
                  title="Entrar com biometria"
                  variant="secondary"
                  onPress={async () => {
                    const r = await LocalAuthentication.authenticateAsync({
                      promptMessage: 'Entrar na Vetta',
                    });
                    if (r.success) await done();
                  }}
                />
              ) : null}
              {GOOGLE_ID ? (
                <GoogleButton
                  onToken={(idToken) => void run(() => client.auth.oauth('GOOGLE', idToken))}
                />
              ) : null}
              {Platform.OS === 'ios' ? (
                <View style={{ height: 48 }}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={12}
                    style={{ flex: 1 }}
                    onPress={() =>
                      run(async () => {
                        const c = await AppleAuthentication.signInAsync({
                          requestedScopes: [
                            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                            AppleAuthentication.AppleAuthenticationScope.EMAIL,
                          ],
                        });
                        const name =
                          [c.fullName?.givenName, c.fullName?.familyName]
                            .filter(Boolean)
                            .join(' ') || undefined;
                        return client.auth.oauth(
                          'APPLE',
                          c.identityToken!,
                          name ? { name } : undefined,
                        );
                      })
                    }
                  />
                </View>
              ) : null}
              <Button
                title="Receber link de acesso por e-mail"
                variant="ghost"
                onPress={() => email && void client.auth.magicLink(email.trim())}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
