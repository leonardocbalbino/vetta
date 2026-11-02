'use client';

import { Button, Card, CardContent, Skeleton } from '@vetta/ui';
import { CheckCircle2, Circle, Download } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';

interface Lesson {
  id: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  completed: boolean;
}
interface Content {
  title: string;
  summary: string | null;
  body: string | null;
  fileUrl: string | null;
  lessons: Lesson[];
}

export default function AcademyContentPage() {
  const { slug } = useParams<{ slug: string }>();
  const c = useApi<Content>(`/v1/academy/${slug}`);
  const [current, setCurrent] = useState(0);
  const progress = useApiMutation<{ lessonId: string; completed: boolean }>(
    'PUT',
    (b) => `/v1/academy/lessons/${b.lessonId}/progress`,
    { invalidate: [`/v1/academy`] },
  );
  if (c.isError)
    return (
      <p className="text-muted-foreground">
        Este conteúdo não está disponível no seu plano.{' '}
        <Link className="text-link underline" href="/assinatura">
          Ver planos
        </Link>
      </p>
    );
  if (!c.data) return <Skeleton className="h-64" />;
  const lesson = c.data.lessons[current];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/academy" className="text-sm text-link underline">
          ← Academy
        </Link>
        <h1 className="mt-2 font-display text-2xl">{c.data.title}</h1>
        {c.data.summary ? <p className="text-muted-foreground">{c.data.summary}</p> : null}
      </div>
      {c.data.fileUrl ? (
        <Button asChild variant="secondary" className="self-start">
          <a href={c.data.fileUrl} target="_blank" rel="noreferrer">
            <Download aria-hidden /> Baixar arquivo
          </a>
        </Button>
      ) : null}
      {c.data.body ? <div className="max-w-prose whitespace-pre-line">{c.data.body}</div> : null}
      {c.data.lessons.length ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              {lesson?.videoUrl ? (
                <video src={lesson.videoUrl} controls className="w-full rounded-card" />
              ) : null}
              <h2 className="font-display text-xl">{lesson?.title}</h2>
              {lesson?.body ? <p className="whitespace-pre-line">{lesson.body}</p> : null}
              {lesson ? (
                <Button
                  className="self-start"
                  variant={lesson.completed ? 'secondary' : 'primary'}
                  onClick={() =>
                    progress.mutate({ lessonId: lesson.id, completed: !lesson.completed })
                  }
                >
                  {lesson.completed ? 'Marcar como não concluída' : 'Concluir aula'}
                </Button>
              ) : null}
            </CardContent>
          </Card>
          <nav aria-label="Aulas">
            <ol className="flex flex-col gap-1">
              {c.data.lessons.map((l, i) => (
                <li key={l.id}>
                  <button
                    className={`flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm ${
                      i === current ? 'bg-muted font-semibold' : 'hover:bg-muted'
                    }`}
                    aria-current={i === current ? 'step' : undefined}
                    onClick={() => setCurrent(i)}
                  >
                    {l.completed ? (
                      <CheckCircle2 className="size-4 text-success" aria-label="concluída" />
                    ) : (
                      <Circle className="size-4" aria-hidden />
                    )}
                    {l.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
