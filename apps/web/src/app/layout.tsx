import { Toaster } from '@vetta/ui';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { archivo, inter } from '@/lib/fonts';
import { HostBrand } from '@/components/host-brand';
import { Providers } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Vetta', template: '%s · Vetta' },
  description: 'Seu método. Seu aluno. Sua evolução.',
  applicationName: 'Vetta',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F1' },
    { media: '(prefers-color-scheme: dark)', color: '#101418' },
  ],
};

/** Aplica o tema escuro antes da pintura (preferência salva ou do sistema). */
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <HostBrand />
          <Providers>{children}</Providers>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
