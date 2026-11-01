import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Text } from './components';
import { useTheme } from './theme';

export interface ChartPoint {
  x: string;
  y: number;
}

/** Linha de série única (2px, marcadores de 8px), toque mostra o valor; lista acessível como alternativa. */
export function LineChart({
  title,
  data,
  unit = '',
}: {
  title: string;
  data: ChartPoint[];
  unit?: string;
}) {
  const t = useTheme();
  const [active, setActive] = useState<number | null>(null);
  const W = 320;
  const H = 160;
  const pad = 16;
  if (!data.length) {
    return (
      <View style={{ gap: 4 }}>
        <Text variant="label">{title}</Text>
        <Text muted>Sem dados ainda.</Text>
      </View>
    );
  }
  const ys = data.map((d) => d.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const x = (i: number) =>
    pad + (data.length === 1 ? (W - 2 * pad) / 2 : (i / (data.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.y)}`).join(' ');
  const a = active !== null ? data[active] : data[data.length - 1];
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <View
      style={{ gap: 4 }}
      accessible
      accessibilityLabel={`${title}: ${data.map((p) => `${p.x.slice(0, 10)} ${fmt(p.y)}${unit}`).join(', ')}`}
    >
      <Text variant="label">{title}</Text>
      <Text variant="title">
        {fmt(a!.y)} {unit}{' '}
        <Text muted variant="caption">
          {new Date(a!.x).toLocaleDateString('pt-BR')}
        </Text>
      </Text>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.5, 1].map((f) => (
          <Line
            key={f}
            x1={pad}
            x2={W - pad}
            y1={pad + f * (H - 2 * pad)}
            y2={pad + f * (H - 2 * pad)}
            stroke={t.colors.border}
            strokeWidth={1}
          />
        ))}
        <Path
          d={d}
          stroke={t.colors.chart}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((p, i) => (
          <Circle
            key={i}
            cx={x(i)}
            cy={y(p.y)}
            r={i === active ? 5 : 4}
            fill={t.colors.chart}
            stroke={t.colors.surface}
            strokeWidth={2}
          />
        ))}
      </Svg>
      <View
        style={{
          flexDirection: 'row',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: H,
        }}
      >
        {data.map((_, i) => (
          <Pressable
            key={i}
            style={{ flex: 1 }}
            onPress={() => setActive(i)}
            accessibilityLabel={`Ponto ${i + 1}`}
          />
        ))}
      </View>
    </View>
  );
}
