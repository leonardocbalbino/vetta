import { ImageResponse } from 'next/og';
import { getSalesPage } from '@/lib/data';

export const alt = 'Página de vendas do personal';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;

/** Open Graph do personal: foto, nome, chamada e CREF; selo discreto da Vetta. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getSalesPage(slug);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#101418',
        color: '#F4F5F1',
        display: 'flex',
        alignItems: 'center',
        padding: 72,
        gap: 56,
      }}
    >
      {p?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.photoUrl}
          width={360}
          height={360}
          alt=""
          style={{ borderRadius: 32, objectFit: 'cover' }}
        />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
        <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
          {p?.headline ?? p?.name ?? 'Treine comigo'}
        </div>
        <div style={{ fontSize: 34, color: '#C6F432' }}>{p?.name ?? ''}</div>
        {p?.cref ? <div style={{ fontSize: 26, opacity: 0.7 }}>{`CREF ${p.cref}`}</div> : null}
        <div
          style={{ fontSize: 22, opacity: 0.6, marginTop: 24 }}
        >{`vettafit.com.br/p/${slug}`}</div>
      </div>
    </div>,
    size,
  );
}
