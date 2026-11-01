import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { archivo, inter } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://vettafit.com.br'),
  title: 'Vetta — Seu método. Seu aluno. Sua evolução.',
  description:
    'Gestão de treinos para personal trainers: prescrição, avaliações, cobrança e app do aluno.',
  openGraph: { locale: 'pt_BR', siteName: 'Vetta', type: 'website' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
