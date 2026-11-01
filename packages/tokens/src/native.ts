import { darkTheme, lightTheme, type SemanticColors } from './themes.js';
import { fontSize, lineHeight, minTouchTarget, radius, spacing } from './scale.js';

/** Nomes das fontes registradas via expo-font no app mobile. */
export const nativeFonts = {
  display: 'Archivo_800ExtraBold_Expanded',
  displayBold: 'Archivo_700Bold_Expanded',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
} as const;

/** Objeto de tokens para React Native (valores numéricos, sem unidades). */
export interface NativeTokens {
  colors: SemanticColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  lineHeight: typeof lineHeight;
  fonts: typeof nativeFonts;
  minTouchTarget: number;
}

function build(colors: SemanticColors): NativeTokens {
  return { colors, spacing, radius, fontSize, lineHeight, fonts: nativeFonts, minTouchTarget };
}

export const nativeTokens = { light: build(lightTheme), dark: build(darkTheme) } as const;
