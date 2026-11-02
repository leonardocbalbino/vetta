import type { ReactNode } from 'react';
import { Footer, Header } from '@/components/chrome';

export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="conteudo" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
        {children}
      </main>
      <Footer />
    </>
  );
}
