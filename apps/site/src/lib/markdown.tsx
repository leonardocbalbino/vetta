import { Fragment, type ReactNode } from 'react';

/** Negrito e links inline ([texto](url)); o resto é texto puro (sem HTML vindo do banco). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      m[1] ? (
        <strong key={m.index}>{m[1]}</strong>
      ) : (
        <a key={m.index} href={m[3]} className="text-action underline">
          {m[2]}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Markdown mínimo para documentos legais: títulos (##, ###), listas (-), citações (>) e parágrafos.
 * Renderiza como elementos React, então não há risco de injeção de HTML.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = source.split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim());
        if (!lines.length) return null;
        const first = lines[0]!;
        if (first.startsWith('### '))
          return (
            <h3 key={i} className="mt-6 text-xl font-bold">
              {inline(first.slice(4))}
            </h3>
          );
        if (first.startsWith('## '))
          return (
            <Fragment key={i}>
              <h2 className="font-display mt-8 text-2xl font-extrabold">
                {inline(first.slice(3))}
              </h2>
              {lines.slice(1).length ? (
                <p className="leading-relaxed">{inline(lines.slice(1).join(' '))}</p>
              ) : null}
            </Fragment>
          );
        if (lines.every((l) => l.startsWith('- ')))
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        if (first.startsWith('> '))
          return (
            <blockquote key={i} className="rounded-control border-l-4 border-warning bg-muted p-3">
              {inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}
            </blockquote>
          );
        return (
          <p key={i} className="leading-relaxed">
            {inline(lines.join(' '))}
          </p>
        );
      })}
    </>
  );
}
