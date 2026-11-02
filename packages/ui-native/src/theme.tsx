import { brandNativeColors, nativeTokens, type NativeTokens } from '@vetta/tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const ThemeContext = createContext<NativeTokens | null>(null);

export interface BrandColors {
  primaryColor?: string | null;
  accentColor?: string | null;
}

/**
 * Tema claro/escuro a partir dos mesmos tokens da web. Com `brand` (white label), as cores de
 * ação, link e destaque do personal sobrescrevem as da Vetta, nas mesmas regras de contraste AA.
 */
export function ThemeProvider({
  scheme,
  brand,
  children,
}: {
  scheme?: 'light' | 'dark';
  brand?: BrandColors | null;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const mode = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const primary = brand?.primaryColor ?? null;
  const accent = brand?.accentColor ?? null;
  const tokens = useMemo(() => {
    const base = nativeTokens[mode];
    if (!primary && !accent) return base;
    return {
      ...base,
      colors: {
        ...base.colors,
        ...brandNativeColors({ primaryColor: primary, accentColor: accent }, mode),
      },
    };
  }, [mode, primary, accent]);
  return <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>;
}

export function useTheme(): NativeTokens {
  return useContext(ThemeContext) ?? nativeTokens.light;
}
