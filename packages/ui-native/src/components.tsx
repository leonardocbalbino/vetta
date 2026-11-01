import { logoSymbol, palette, planBadges, type PlanBadgeCode } from '@vetta/tokens';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch as RNSwitch,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from './theme';

// ─── Texto ────────────────────────────────────────────────────────────────

type TextVariant = 'display' | 'title' | 'body' | 'caption' | 'label';

export function Text({
  variant = 'body',
  muted,
  style,
  ...props
}: TextProps & { variant?: TextVariant; muted?: boolean }) {
  const t = useTheme();
  const base: Record<TextVariant, TextStyle> = {
    display: {
      fontFamily: t.fonts.display,
      fontSize: t.fontSize['2xl'],
      lineHeight: t.lineHeight['2xl'],
      letterSpacing: -0.5,
    },
    title: {
      fontFamily: t.fonts.displayBold,
      fontSize: t.fontSize.lg,
      lineHeight: t.lineHeight.lg,
    },
    body: { fontFamily: t.fonts.sans, fontSize: t.fontSize.base, lineHeight: t.lineHeight.base },
    caption: { fontFamily: t.fonts.sans, fontSize: t.fontSize.sm, lineHeight: t.lineHeight.sm },
    label: {
      fontFamily: t.fonts.sansSemibold,
      fontSize: t.fontSize.sm,
      lineHeight: t.lineHeight.sm,
    },
  };
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[
        base[variant],
        { color: muted ? t.colors.mutedForeground : t.colors.foreground },
        style,
      ]}
      {...props}
    />
  );
}

// ─── Botão ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'accent' | 'action' | 'secondary' | 'ghost' | 'destructive';

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...props
}: PressableProps & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = t.colors;
  const colors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.primaryForeground },
    accent: { bg: c.accent, fg: c.accentForeground },
    action: { bg: c.action, fg: c.actionForeground },
    secondary: { bg: c.surface, fg: c.foreground, border: c.input },
    ghost: { bg: 'transparent', fg: c.foreground },
    destructive: { bg: c.danger, fg: c.dangerForeground },
  };
  const v = colors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          minHeight: t.minTouchTarget,
          paddingHorizontal: t.spacing[5],
          borderRadius: t.radius.control,
          backgroundColor: v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: t.spacing[2],
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : null}
      <RNText style={{ color: v.fg, fontFamily: t.fonts.sansSemibold, fontSize: t.fontSize.base }}>
        {title}
      </RNText>
    </Pressable>
  );
}

// ─── Campo ────────────────────────────────────────────────────────────────

export function Input({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: t.spacing[2] }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={t.colors.mutedForeground}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            minHeight: t.minTouchTarget,
            borderRadius: t.radius.control,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? t.colors.danger : focused ? t.colors.ring : t.colors.input,
            backgroundColor: t.colors.surface,
            color: t.colors.foreground,
            paddingHorizontal: t.spacing[3],
            fontFamily: t.fonts.sans,
            fontSize: t.fontSize.base,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text variant="caption" style={{ color: t.colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Switch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: t.minTouchTarget,
      }}
    >
      <Text>{label}</Text>
      <RNSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: t.colors.action, false: t.colors.input }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

// ─── Cartão, selo, esqueleto, vazio ───────────────────────────────────────

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.card,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: t.spacing[5],
          gap: t.spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PlanBadge({ plan }: { plan: PlanBadgeCode }) {
  const b = planBadges[plan];
  const label = { FREE: 'Free', PRO: 'Pro', PRO_PLUS: 'Pro Plus' }[plan];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: b.background,
        borderColor: b.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 2,
      }}
    >
      <RNText style={{ color: b.foreground, fontSize: 12, fontWeight: '700' }}>{label}</RNText>
    </View>
  );
}

export function Skeleton({
  height = 16,
  width = '100%' as ViewStyle['width'],
}: {
  height?: number;
  width?: ViewStyle['width'];
}) {
  const t = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{ height, width, borderRadius: t.radius.sm, backgroundColor: t.colors.muted }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing[3], padding: t.spacing[8] }}>
      <Text variant="title">{title}</Text>
      {description ? (
        <Text muted style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

// ─── Marca ────────────────────────────────────────────────────────────────

export function Logo({
  variant = 'principal',
  size = 32,
}: {
  variant?: 'principal' | 'positivo' | 'simbolo';
  size?: number;
}) {
  const t = useTheme();
  const symbolColor = variant === 'positivo' ? palette.cume : palette.tinta;
  const wordColor = variant === 'positivo' ? palette.nevoa : palette.tinta;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Vetta"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Svg width={size} height={size} viewBox={logoSymbol.viewBox}>
        <Polyline
          points={logoSymbol.points}
          fill="none"
          stroke={symbolColor}
          strokeWidth={logoSymbol.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {variant !== 'simbolo' ? (
        <RNText
          style={{
            fontFamily: t.fonts.display,
            fontSize: size * 0.9,
            color: wordColor,
            letterSpacing: -size * 0.03,
          }}
        >
          vetta
        </RNText>
      ) : null}
    </View>
  );
}

/** Cadeado com CTA de upgrade (use com useFeature). */
export function LockedFeature({
  locked,
  title,
  description,
  requiredPlan,
  onUpgrade,
  children,
}: {
  locked: boolean;
  title: string;
  description?: string;
  requiredPlan?: 'PRO' | 'PRO_PLUS';
  onUpgrade: () => void;
  children?: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="title">🔒 {title}</Text>
        {requiredPlan ? <PlanBadge plan={requiredPlan} /> : null}
      </View>
      <Text muted>{description ?? 'Este recurso não faz parte do seu plano atual.'}</Text>
      <Button variant="action" title="Fazer upgrade" onPress={onUpgrade} />
    </Card>
  );
}
