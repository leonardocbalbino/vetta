import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/content/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Conteúdo prático sobre prescrição, acompanhamento e gestão para personal trainers.',
  alternates: { canonical: '/blog' },
};

export default function Blog() {
  return (
    <>
      <h1 className="font-display text-[2rem] font-extrabold">Blog</h1>
      <p className="text-muted-foreground">
        Prescrição, acompanhamento e gestão para personal trainers.
      </p>
      <ul className="mt-6 flex flex-col gap-6">
        {POSTS.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="group flex flex-col gap-1">
              <span className="text-xl font-bold group-hover:underline">{p.title}</span>
              <span className="text-muted-foreground">{p.description}</span>
              <time dateTime={p.date} className="text-sm text-muted-foreground">
                {new Date(`${p.date}T12:00:00Z`).toLocaleDateString('pt-BR')}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
