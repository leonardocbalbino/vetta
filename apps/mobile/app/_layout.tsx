import { Archivo_700Bold, Archivo_800ExtraBold } from '@expo-google-fonts/archivo';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VettaProvider } from '@vetta/sdk/react';
import { nativeFonts } from '@vetta/tokens';
import { ThemeProvider, useTheme } from '@vetta/ui-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useQuery } from '@tanstack/react-query';
import type { PublicBrand } from '@vetta/contracts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { client } from '../src/lib/client';
import { listenNotificationTaps, registerForPush } from '../src/lib/notifications';
import { startAutoSync } from '../src/lib/offline';
import { SessionProvider, useSession } from '../src/lib/session';

void SplashScreen.preventAutoHideAsync();

function Effects() {
  const { me, mode } = useSession();
  const modeRef = useRef(mode ?? 'aluno');
  modeRef.current = mode ?? 'aluno';
  useEffect(() => startAutoSync(), []);
  useEffect(() => listenNotificationTaps(() => modeRef.current), []);
  useEffect(() => {
    if (me) void registerForPush();
  }, [me]);
  return null;
}

/** Tema do personal do vínculo ativo (white label); sem white label, o tema Vetta. */
function BrandTheme({ children }: { children: ReactNode }) {
  const { active } = useSession();
  const brand = useQuery({
    queryKey: ['brand-active', active?.tenantId],
    queryFn: () => client.request<PublicBrand>('GET', '/v1/brand/active'),
    enabled: !!active,
    staleTime: 10 * 60_000,
  });
  const b = brand.data?.whiteLabel ? brand.data : null;
  return <ThemeProvider brand={b}>{children}</ThemeProvider>;
}

function Shell() {
  const t = useTheme();
  return (
    <>
      <StatusBar style="auto" />
      <Effects />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.colors.background },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  // Pendência: trocar por Archivo Expanded (wdth 125) estático em assets/fonts.
  const [loaded] = useFonts({
    [nativeFonts.display]: Archivo_800ExtraBold,
    [nativeFonts.displayBold]: Archivo_700Bold,
    [nativeFonts.sans]: Inter_400Regular,
    [nativeFonts.sansMedium]: Inter_500Medium,
    [nativeFonts.sansSemibold]: Inter_600SemiBold,
    [nativeFonts.sansBold]: Inter_700Bold,
  });
  const [queryClient] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, networkMode: 'offlineFirst' } } }),
  );
  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <VettaProvider client={client}>
        <SessionProvider>
          <BrandTheme>
            <Shell />
          </BrandTheme>
        </SessionProvider>
      </VettaProvider>
    </QueryClientProvider>
  );
}
