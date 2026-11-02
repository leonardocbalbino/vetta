'use client';

import { Badge, Card, CardContent, EmptyState, Skeleton } from '@vetta/ui';
import { BookOpen, FileText, GraduationCap, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApi } from '@/lib/api';

interface Content {
  id: string;
  slug: string;
  type: 'COURSE' | 'EBOOK' | 'POST';
  title: string;
  summary: string | null;
  requiredPlan: 'PRO' | 'PRO_PLUS' | null;
  locked: boolean;
  coverUrl: string | null;
  lessons: number;
  progress: number | null;
}

const TYPES = [
  { value: '', label: 'Tudo' },
  { value: 'COURSE', label: 'Cursos' },
  { value: 'EBOOK', label: 'E-books' },
  { value: 'POST', label: 'Posts' },
] as const;
const ICON = { COURSE: GraduationCap, EBOOK: BookOpen, POST: FileText };

/** Academy: cursos, e-books e posts da Vetta, com acesso pelo plano e progresso. */
export default function AcademyPage() {
  const [type, setType] = useState('');
  const list = useApi<Content[]>(`/v1/academy${type ? `?type=${type}` : ''}`);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">Academy</h1>
        <p className="text-muted-foreground">Conteúdo para crescer como personal.</p>
      </div>
      <div role="tablist" aria-label="Tipo de conteúdo" className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={type === t.value}
            className={`min-h-11 rounded-control border px-4 text-sm font-medium ${
              type === t.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border'
            }`}
            onClick={() => setType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!list.data ? (
        <Skeleton className="h-48" />
      ) : !list.data.length ? (
        <EmptyState title="Nada publicado ainda" description="Volte em breve." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((c) => {
            const Icon = ICON[c.type];
            return (
              <Link
                key={c.id}
                href={c.locked ? '/assinatura' : `/academy/${c.slug}`}
                className="rounded-card focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Card className="h-full overflow-hidden">
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverUrl} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-muted">
                      <Icon className="size-10 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                  <CardContent className="flex flex-col gap-2 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.locked ? (
                        <Badge variant="outline">
                          <Lock className="size-3" aria-hidden />{' '}
                          {c.requiredPlan === 'PRO_PLUS' ? 'Pro Plus' : 'Pro'}
                        </Badge>
                      ) : null}
                      {c.progress !== null ? (
                        <span className="text-xs text-muted-foreground">
                          {c.progress}% concluído
                        </span>
                      ) : null}
                    </div>
                    <h2 className="font-semibold">{c.title}</h2>
                    {c.summary ? (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{c.summary}</p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
