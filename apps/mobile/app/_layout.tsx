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
import { ThemeProvider } from '@vetta/ui-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { client } from '../src/lib/client';

void SplashScreen.preventAutoHideAsync();

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
    () => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  );

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <VettaProvider client={client}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </VettaProvider>
    </QueryClientProvider>
  );
}
