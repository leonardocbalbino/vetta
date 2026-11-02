import { notFound } from 'next/navigation';
import { getLegal } from '@/lib/data';
import { Markdown } from '@/lib/markdown';
import { Footer, Header } from './chrome';

/** Documento legal publicado (versão vigente vinda da API, revalidada a cada hora). */
export async function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const doc = await getLegal(kind);
  if (!doc) notFound();
  return (
    <>
      <Header />
      <main id="conteudo" className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
        <h1 className="font-display text-[2rem] font-extrabold">{doc.title}</h1>
        <p className="text-sm text-muted-foreground">
          Versão {doc.version} · publicada em{' '}
          {new Date(doc.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </p>
        <Markdown source={doc.content} />
      </main>
      <Footer />
    </>
  );
}
