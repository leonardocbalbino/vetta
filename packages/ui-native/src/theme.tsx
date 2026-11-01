import { nativeTokens, type NativeTokens } from '@vetta/tokens';
import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const ThemeContext = createContext<NativeTokens | null>(null);

/** Tema claro/escuro a partir dos mesmos tokens da web. */
export function ThemeProvider({
  scheme,
  children,
}: {
  scheme?: 'light' | 'dark';
  children: ReactNode;
}) {
  const system = useColorScheme();
  const tokens = nativeTokens[scheme ?? (system === 'dark' ? 'dark' : 'light')];
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): NativeTokens {
  return useContext(ThemeContext) ?? nativeTokens.light;
}
