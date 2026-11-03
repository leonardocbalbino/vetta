import { logoSymbol, palette } from '@vetta/tokens';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from './theme';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

/** Comprimento do traço do símbolo (pontos 7,16 → 19,36 → 41,9). */
const LENGTH = Math.hypot(12, 20) + Math.hypot(22, 27);

/**
 * Loading da marca no app: o V se desenha como um check e some, em loop.
 * Com "reduzir movimento" ativo no aparelho, só pulsa.
 */
export function LogoLoader({
  size = 56,
  fullscreen = false,
  label = 'Carregando',
}: {
  size?: number;
  fullscreen?: boolean;
  label?: string;
}) {
  const t = useTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      reduced
        ? Animated.sequence([
            Animated.timing(progress, { toValue: 1, duration: 800, useNativeDriver: false }),
            Animated.timing(progress, { toValue: 0, duration: 800, useNativeDriver: false }),
          ])
        : Animated.timing(progress, {
            toValue: 1,
            duration: 1400,
            easing: Easing.bezier(0.65, 0, 0.35, 1),
            useNativeDriver: false,
          }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduced]);

  // Desenha até 55%, segura até 80%, some até 100% (igual à web).
  const dashoffset = reduced
    ? 0
    : progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [LENGTH, 0, 0] });
  const opacity = reduced
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] })
    : progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  const dark = t.colors.background === palette.tinta;
  const color = dark ? palette.cume : palette.tinta;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={
        fullscreen
          ? {
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.colors.background,
            }
          : { alignItems: 'center', justifyContent: 'center' }
      }
    >
      <Svg width={size} height={size} viewBox={logoSymbol.viewBox}>
        <Polyline
          points={logoSymbol.points}
          fill="none"
          stroke={color}
          strokeOpacity={0.12}
          strokeWidth={logoSymbol.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <AnimatedPolyline
          points={logoSymbol.points}
          fill="none"
          stroke={color}
          strokeWidth={logoSymbol.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${LENGTH}`}
          strokeDashoffset={dashoffset}
          opacity={opacity}
        />
      </Svg>
    </View>
  );
}
