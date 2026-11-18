'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Skeleton,
  Textarea,
} from '@vetta/ui';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { fmtDate, useApi, useApiMutation } from '@/lib/api';

interface Request {
  id: string;
  caption: string | null;
  consentStatus: 'REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED';
  consentAt: string | null;
  beforeUrl: string | null;
  afterUrl: string | null;
}

/** Aluno: autoriza (ou revoga) o uso do antes/depois na página do personal e envia depoimento. */
export default function Authorizations() {
  const reqs = useApi<Request[]>('/v1/me/result-requests');
  const answer = useApiMutation<{ id: string; granted: boolean }>(
    'POST',
    (b) => `/v1/me/result-requests/${b.id}`,
    { invalidate: ['/v1/me/result-requests'], success: 'Resposta registrada.' },
  );
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const send = useApiMutation<object>('POST', '/v1/me/testimonials', {
    success: 'Obrigado! Seu personal vai revisar o depoimento.',
    onSuccess: () => setText(''),
  });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl">Autorizações e depoimento</h1>
      <Card>
        <CardHeader>
          <CardTitle>Fotos de resultado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Seu personal só mostra seu antes e depois na página de vendas com a sua autorização.
            Você pode revogar quando quiser.
          </p>
          {!reqs.data ? (
            <Skeleton className="h-32" />
          ) : (
            reqs.data.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-control border border-border p-3"
              >
                <div className="flex gap-2">
                  {[r.beforeUrl, r.afterUrl].map((u, i) =>
                    u ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={u}
                        alt={i === 0 ? 'Antes' : 'Depois'}
                        className="h-40 w-28 rounded object-cover"
                      />
                    ) : null,
                  )}
                </div>
                {r.caption ? <p className="text-sm">{r.caption}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.consentStatus === 'GRANTED'
                        ? 'success'
                        : r.consentStatus === 'REQUESTED'
                          ? 'warning'
                          : 'outline'
                    }
                  >
                    {r.consentStatus === 'GRANTED'
                      ? `autorizado em ${fmtDate(r.consentAt)}`
                      : r.consentStatus === 'REQUESTED'
                        ? 'aguardando sua resposta'
                        : r.consentStatus === 'DENIED'
                          ? 'recusado'
                          : 'revogado'}
                  </Badge>
                  {r.consentStatus !== 'GRANTED' ? (
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={() => answer.mutate({ id: r.id, granted: true })}
                    >
                      Autorizar
                    </Button>
                  ) : null}
                  {r.consentStatus === 'GRANTED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => answer.mutate({ id: r.id, granted: false })}
                    >
                      Revogar
                    </Button>
                  ) : r.consentStatus === 'REQUESTED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => answer.mutate({ id: r.id, granted: false })}
                    >
                      Recusar
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
          {reqs.data && !reqs.data.length ? (
            <p className="text-muted-foreground">Nenhum pedido.</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deixe um depoimento</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate({ text, rating });
            }}
          >
            <div className="flex gap-1" role="radiogroup" aria-label="Nota">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} estrelas`}
                  className="grid size-11 place-items-center"
                  onClick={() => setRating(n)}
                >
                  <Star
                    className={n <= rating ? 'fill-warning text-warning' : 'text-muted-foreground'}
                  />
                </button>
              ))}
            </div>
            <Field label="Como está sendo treinar com seu personal?">
              <Textarea
                required
                minLength={10}
                maxLength={800}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="accent" className="self-start" loading={send.isPending}>
              Enviar depoimento
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
