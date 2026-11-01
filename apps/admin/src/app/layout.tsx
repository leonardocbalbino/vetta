import { Toaster } from '@vetta/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/lib/client';
import { archivo, inter } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Vetta Admin', template: '%s · Vetta Admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
