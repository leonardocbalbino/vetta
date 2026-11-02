import { ImageResponse } from 'next/og';

export const alt = 'Vetta — Prescreva, acompanhe e receba. Tudo no mesmo app.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Imagem de compartilhamento: fundo tinta, símbolo cume e a promessa principal. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#101418',
        color: '#F4F5F1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        gap: 32,
      }}
    >
      <svg width="120" height="120" viewBox="0 0 48 48">
        <polyline
          points="7,16 19,36 41,9"
          fill="none"
          stroke="#C6F432"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, maxWidth: 960 }}>
        Prescreva, acompanhe e receba. Tudo no mesmo app.
      </div>
      <div style={{ fontSize: 32, color: '#C6F432' }}>vettafit.com.br</div>
    </div>,
    size,
  );
}
