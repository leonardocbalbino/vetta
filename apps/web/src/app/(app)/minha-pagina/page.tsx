'use client';

import { uploadFile } from '@vetta/sdk';
import { useFeature, useVettaClient } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  Uploader,
} from '@vetta/ui';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Page {
  slug: string;
  url: string;
  tenantName: string;
  cref: string | null;
  headline: string | null;
  bio: string | null;
  photoMediaId: string | null;
  photoUrl: string | null;
  specialties: string[];
  faq: { question: string; answer: string }[];
  socialLinks: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  isPublished: boolean;
}
interface Testimonial {
  id: string;
  authorName: string;
  text: string;
  rating: number | null;
  status: 'PENDING' | 'APPROVED' | 'HIDDEN';
}
interface Result {
  id: string;
  studentLink: { displayName: string };
  caption: string | null;
  consentStatus: 'REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED';
}

const CONSENT: Record<
  Result['consentStatus'],
  { label: string; variant: 'warning' | 'success' | 'outline' }
> = {
  REQUESTED: { label: 'aguardando o aluno', variant: 'warning' },
  GRANTED: { label: 'autorizado', variant: 'success' },
  DENIED: { label: 'recusado', variant: 'outline' },
  REVOKED: { label: 'autorização revogada', variant: 'outline' },
};

function Editor() {
  const client = useVettaClient();
  const page = useApi<Page>('/v1/sales-page');
  const [p, setP] = useState<Page | null>(null);
  useEffect(() => {
    if (page.data) setP(page.data);
  }, [page.data]);
  const save = useApiMutation<object>('PUT', '/v1/sales-page', {
    invalidate: ['/v1/sales-page'],
    success: 'Página salva.',
  });
  if (!p) return <Skeleton className="h-96" />;
  const submit = (isPublished = p.isPublished) =>
    save.mutate({
      headline: p.headline || null,
      bio: p.bio || null,
      photoMediaId: p.photoMediaId,
      specialties: p.specialties.filter(Boolean),
      faq: p.faq.filter((f) => f.question.trim() && f.answer.trim()),
      socialLinks: Object.fromEntries(Object.entries(p.socialLinks).filter(([, v]) => v)),
      seoTitle: p.seoTitle || null,
      seoDescription: p.seoDescription || null,
      isPublished,
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Sua página{' '}
          <Badge variant={p.isPublished ? 'success' : 'outline'}>
            {p.isPublished ? 'publicada' : 'rascunho'}
          </Badge>
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm text-link underline"
          >
            {p.url.replace(/^https?:\/\//, '')} <ExternalLink className="size-4" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Foto</p>
            {p.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photoUrl} alt="Sua foto" className="size-32 rounded-card object-cover" />
            ) : null}
            <Uploader
              accept="image/jpeg,image/png,image/webp"
              maxBytes={5 * 1024 * 1024}
              label="Enviar foto"
              upload={({ file, onProgress, signal }) =>
                uploadFile(client, file, {
                  purpose: 'avatar',
                  signal,
                  onProgress: (x) => onProgress(x.ratio),
                })
              }
              onUploaded={(id) => setP({ ...p, photoMediaId: id, photoUrl: null })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Chamada principal">
              <Input
                maxLength={120}
                value={p.headline ?? ''}
                onChange={(e) => setP({ ...p, headline: e.target.value })}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              CREF exibido: {p.cref ?? 'cadastre em Configurações'}
            </p>
          </div>
          <Field label="Sobre você" className="md:col-span-2">
            <Textarea
              maxLength={3000}
              value={p.bio ?? ''}
              onChange={(e) => setP({ ...p, bio: e.target.value })}
            />
          </Field>
          <Field label="Especialidades (vírgula)" className="md:col-span-2">
            <Input
              value={p.specialties.join(', ')}
              onChange={(e) =>
                setP({ ...p, specialties: e.target.value.split(',').map((s) => s.trimStart()) })
              }
            />
          </Field>
          <fieldset className="flex flex-col gap-2 md:col-span-2">
            <legend className="mb-1 font-semibold">Perguntas frequentes</legend>
            {p.faq.map((f, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <Input
                  aria-label="Pergunta"
                  placeholder="Pergunta"
                  value={f.question}
                  onChange={(e) =>
                    setP({
                      ...p,
                      faq: p.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  aria-label="Resposta"
                  placeholder="Resposta"
                  value={f.answer}
                  onChange={(e) =>
                    setP({
                      ...p,
                      faq: p.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)),
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remover pergunta"
                  onClick={() => setP({ ...p, faq: p.faq.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setP({ ...p, faq: [...p.faq, { question: '', answer: '' }] })}
            >
              <Plus /> Adicionar pergunta
            </Button>
          </fieldset>
          {(['instagram', 'youtube', 'tiktok', 'site', 'whatsapp'] as const).map((k) => (
            <Field
              key={k}
              label={
                {
                  instagram: 'Instagram',
                  youtube: 'YouTube',
                  tiktok: 'TikTok',
                  site: 'Site',
                  whatsapp: 'WhatsApp',
                }[k]
              }
            >
              <Input
                value={p.socialLinks[k] ?? ''}
                onChange={(e) =>
                  setP({ ...p, socialLinks: { ...p.socialLinks, [k]: e.target.value } })
                }
              />
            </Field>
          ))}
          <Field label="Título para o Google (até 70)">
            <Input
              maxLength={70}
              value={p.seoTitle ?? ''}
              onChange={(e) => setP({ ...p, seoTitle: e.target.value })}
            />
          </Field>
          <Field label="Descrição para o Google (até 160)">
            <Input
              maxLength={160}
              value={p.seoDescription ?? ''}
              onChange={(e) => setP({ ...p, seoDescription: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" variant="secondary" loading={save.isPending}>
              Salvar
            </Button>
            <Button
              type="button"
              variant="action"
              loading={save.isPending}
              onClick={() => submit(!p.isPublished)}
            >
              {p.isPublished ? 'Despublicar' : 'Publicar página'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground md:col-span-2">
            Os planos que aparecem na página são os marcados como &quot;Mostrar na página de
            vendas&quot; em Financeiro → Planos.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function Testimonials() {
  const list = useApi<Testimonial[]>('/v1/sales-page/testimonials');
  const set = useApiMutation<{ id: string; status: Testimonial['status'] }>(
    'PATCH',
    (b) => `/v1/sales-page/testimonials/${b.id}`,
    { invalidate: ['/v1/sales-page/testimonials'] },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Depoimentos dos alunos</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Os alunos enviam pelo app. Só aparecem na página depois que você aprova.
        </p>
        <ul className="flex flex-col gap-3">
          {(list.data ?? []).map((t) => (
            <li key={t.id} className="rounded-control border border-border p-3">
              <p>“{t.text}”</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.authorName}
                {t.rating ? ` · ${'★'.repeat(t.rating)}` : ''}
              </p>
              <div className="mt-2 flex gap-2">
                {t.status !== 'APPROVED' ? (
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => set.mutate({ id: t.id, status: 'APPROVED' })}
                  >
                    Aprovar
                  </Button>
                ) : (
                  <Badge variant="success">na página</Badge>
                )}
                {t.status !== 'HIDDEN' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => set.mutate({ id: t.id, status: 'HIDDEN' })}
                  >
                    Ocultar
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
          {!list.data?.length ? (
            <li className="text-muted-foreground">Nenhum depoimento ainda.</li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

function Results() {
  const list = useApi<Result[]>('/v1/sales-page/results');
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    '/v1/students?status=ACTIVE',
  );
  const [studentLinkId, setStudent] = useState('');
  const photos = useApi<{ id: string; url: string; takenAt: string }[]>(
    studentLinkId ? `/v1/progress/${studentLinkId}/photos` : null,
  );
  const [sel, setSel] = useState<{ before?: string; after?: string; caption: string }>({
    caption: '',
  });
  const request = useApiMutation<object>('POST', '/v1/sales-page/results', {
    invalidate: ['/v1/sales-page/results'],
    success: 'Pedido enviado ao aluno.',
    onSuccess: () => setSel({ caption: '' }),
  });
  const del = useApiMutation<string>('DELETE', (id) => `/v1/sales-page/results/${id}`, {
    invalidate: ['/v1/sales-page/results'],
  });
  const photoList = Array.isArray(photos.data)
    ? photos.data
    : ((photos.data as unknown as { items?: { id: string; url: string; takenAt: string }[] })
        ?.items ?? []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultados (antes e depois)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          O aluno recebe um pedido de autorização no app. A foto só aparece na página se ele
          autorizar, e ele pode revogar quando quiser.
        </p>
        <Field label="Aluno">
          <Select
            value={studentLinkId}
            onValueChange={(v) => {
              setStudent(v);
              setSel({ caption: '' });
            }}
          >
            <SelectTrigger aria-label="Aluno">
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {(students.data?.items ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {studentLinkId ? (
          <>
            <div className="flex flex-wrap gap-2">
              {photoList.map((ph) => (
                <button
                  key={ph.id}
                  type="button"
                  aria-pressed={sel.before === ph.id || sel.after === ph.id}
                  onClick={() =>
                    setSel(
                      !sel.before || (sel.before && sel.after)
                        ? { ...sel, before: ph.id, after: undefined }
                        : { ...sel, after: ph.id },
                    )
                  }
                  className={`relative rounded-control border-4 ${sel.before === ph.id ? 'border-warning' : sel.after === ph.id ? 'border-success' : 'border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ph.url}
                    alt={`Foto de ${new Date(ph.takenAt).toLocaleDateString('pt-BR')}`}
                    className="h-28 w-20 rounded object-cover"
                  />
                  {sel.before === ph.id ? (
                    <span className="absolute left-1 top-1 rounded bg-warning px-1 text-xs">
                      antes
                    </span>
                  ) : null}
                  {sel.after === ph.id ? (
                    <span className="absolute left-1 top-1 rounded bg-success px-1 text-xs text-white">
                      depois
                    </span>
                  ) : null}
                </button>
              ))}
              {!photoList.length ? (
                <p className="text-muted-foreground">Este aluno ainda não tem fotos.</p>
              ) : null}
            </div>
            <Field label="Legenda (opcional)">
              <Input
                maxLength={200}
                value={sel.caption}
                onChange={(e) => setSel({ ...sel, caption: e.target.value })}
              />
            </Field>
            <Button
              className="self-start"
              disabled={!sel.before || !sel.after}
              loading={request.isPending}
              onClick={() =>
                request.mutate({
                  studentLinkId,
                  beforePhotoId: sel.before,
                  afterPhotoId: sel.after,
                  ...(sel.caption ? { caption: sel.caption } : {}),
                })
              }
            >
              Pedir autorização
            </Button>
          </>
        ) : null}
        <ul className="flex flex-col gap-2">
          {(list.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">
                {r.studentLink.displayName}
                {r.caption ? ` · ${r.caption}` : ''}
              </span>
              <Badge variant={CONSENT[r.consentStatus].variant}>
                {CONSENT[r.consentStatus].label}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover"
                onClick={() => del.mutate(r.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Logo() {
  const client = useVettaClient();
  const { tenantId } = useActiveTenant();
  const branding = useFeature(tenantId, 'assessment.pdf_branding');
  const logo = useApi<{ mediaId: string | null }>('/v1/brand/logo');
  const save = useApiMutation<object>('PUT', '/v1/brand/logo', {
    invalidate: ['/v1/brand/logo'],
    success: 'Logo salva. Ela já sai nos PDFs.',
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo nos PDFs de treino e avaliação</CardTitle>
      </CardHeader>
      <CardContent>
        <LockedFeature
          locked={branding.locked}
          loading={branding.loading}
          title="PDF com sua logo"
          requiredPlan="PRO"
        >
          <p className="mb-2 text-sm">
            {logo.data?.mediaId ? 'Logo cadastrada.' : 'Sem logo: os PDFs usam o seu nome.'} Use PNG
            ou JPG com fundo transparente ou branco.
          </p>
          <Uploader
            accept="image/png,image/jpeg"
            maxBytes={5 * 1024 * 1024}
            label="Enviar logo"
            upload={({ file, onProgress, signal }) =>
              uploadFile(client, file, {
                purpose: 'brand_logo',
                signal,
                onProgress: (x) => onProgress(x.ratio),
              })
            }
            onUploaded={(mediaId) => save.mutate({ mediaId })}
          />
          {logo.data?.mediaId ? (
            <Button variant="ghost" className="mt-2" onClick={() => save.mutate({ mediaId: null })}>
              Remover logo
            </Button>
          ) : null}
        </LockedFeature>
      </CardContent>
    </Card>
  );
}

export default function SalesPageEditor() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'brand.sales_page');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Minha página</h1>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="Página de vendas"
        requiredPlan="PRO"
        description="Sua vitrine com planos e checkout: quem compra já vira aluno."
      >
        <Editor />
        <div className="grid gap-6 lg:grid-cols-2">
          <Testimonials />
          <Results />
        </div>
      </LockedFeature>
      <Logo />
    </div>
  );
}
