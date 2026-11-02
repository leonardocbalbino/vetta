'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { HelpArticle } from '@/content/help';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Busca instantânea nos artigos (título, resumo, tema e palavras-chave, sem acento). */
export function HelpSearch({ articles }: { articles: HelpArticle[] }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return articles;
    return articles
      .map((a) => {
        const hay = norm([a.title, a.summary, a.category, ...a.keywords].join(' '));
        const title = norm(a.title);
        const score = terms.reduce(
          (s, t) => s + (title.includes(t) ? 3 : 0) + (hay.includes(t) ? 1 : 0),
          0,
        );
        const all = terms.every((t) => hay.includes(t));
        return { a, score: all ? score : 0 };
      })
      .filter((r) => r.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((r) => r.a);
  }, [q, articles]);
  const groups = useMemo(() => {
    const m = new Map<string, HelpArticle[]>();
    for (const a of results) m.set(a.category, [...(m.get(a.category) ?? []), a]);
    return [...m.entries()];
  }, [results]);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Buscar na ajuda</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex.: domínio próprio, convidar aluno, Pix"
          className="min-h-11 rounded-control border border-input bg-surface px-3"
        />
      </label>
      <p className="sr-only" aria-live="polite">
        {results.length} artigo(s) encontrado(s)
      </p>
      {groups.map(([category, list]) => (
        <section key={category}>
          <h2 className="mb-2 font-display text-xl font-extrabold">{category}</h2>
          <ul className="flex flex-col gap-3">
            {list.map((a) => (
              <li key={a.slug}>
                <Link href={`/ajuda/${a.slug}`} className="group flex flex-col">
                  <span className="font-bold group-hover:underline">{a.title}</span>
                  <span className="text-sm text-muted-foreground">{a.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!results.length ? (
        <p className="text-muted-foreground">
          Nada encontrado para “{q}”. Tente outras palavras ou abra um chamado pelo app.
        </p>
      ) : null}
    </div>
  );
}
