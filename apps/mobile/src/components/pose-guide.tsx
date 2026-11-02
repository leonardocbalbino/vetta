import Svg, { Ellipse, Line, Path } from 'react-native-svg';

/** Guia de pose: silhueta + linhas de prumo para fotos comparáveis (progresso e postural). */
export function PoseGuide({ side }: { side: boolean }) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 100 180"
      style={{ position: 'absolute' }}
      pointerEvents="none"
    >
      <Line
        x1="50"
        y1="0"
        x2="50"
        y2="180"
        stroke="#C6F432"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <Line
        x1="0"
        y1="165"
        x2="100"
        y2="165"
        stroke="#C6F432"
        strokeWidth="0.4"
        strokeDasharray="2 2"
      />
      <Ellipse cx="50" cy="22" rx="8" ry="10" stroke="#F4F5F1" strokeWidth="0.8" fill="none" />
      {side ? (
        <Path
          d="M50 32 C58 40 58 70 54 95 L56 165 M50 32 C44 45 44 70 48 95 L46 165"
          stroke="#F4F5F1"
          strokeWidth="0.8"
          fill="none"
        />
      ) : (
        <Path
          d="M50 32 L30 40 L24 95 M50 32 L70 40 L76 95 M36 42 L38 100 L40 165 M64 42 L62 100 L60 165"
          stroke="#F4F5F1"
          strokeWidth="0.8"
          fill="none"
        />
      )}
    </Svg>
  );
}
