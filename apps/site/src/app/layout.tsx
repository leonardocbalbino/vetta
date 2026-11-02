import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ConsentManager } from '@/components/consent';
import { SITE_URL } from '@/lib/data';
import { archivo, inter } from '@/lib/fonts';
import './globals.css';

const DESCRIPTION =
  'Prescreva treinos, acompanhe a evolução e receba dos seus alunos no mesmo app. Feito para personal trainers. Teste 14 dias grátis.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Vetta — Seu método. Seu aluno. Sua evolução.', template: '%s · Vetta' },
  description: DESCRIPTION,
  applicationName: 'Vetta',
  alternates: { canonical: '/' },
  openGraph: {
    locale: 'pt_BR',
    siteName: 'Vetta',
    type: 'website',
    url: SITE_URL,
    title: 'Vetta — Seu método. Seu aluno. Sua evolução.',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: '#101418' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:p-3"
        >
          Pular para o conteúdo
        </a>
        {children}
        <ConsentManager />
      </body>
    </html>
  );
}
