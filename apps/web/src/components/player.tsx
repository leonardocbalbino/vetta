'use client';

import type { FeedbackInput, SyncSessionInput } from '@vetta/contracts';
import {
  buildPlayer,
  isFinished,
  newClientSessionId,
  nextPosition,
  progress,
  toSyncPayload,
  type ApiProgram,
  type ApiRoutine,
  type PlayerItem,
  type Position,
} from '@vetta/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  LogoSymbol,
  Switch,
  Textarea,
} from '@vetta/ui';
import { Pause, Play, Repeat, SkipForward, Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecordHit {
  exerciseName: string;
  type: 'MAX_LOAD' | 'ONE_RM' | 'MAX_VOLUME';
  value: number;
}

const RECORD_LABEL = {
  MAX_LOAD: 'Carga máxima',
  ONE_RM: '1RM estimado',
  MAX_VOLUME: 'Volume',
} as const;

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    // sem áudio disponível
  }
}

/** Cronômetro de descanso automático: vibra e toca um bipe ao zerar. */
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (paused) return;
    if (left <= 0) {
      navigator.vibrate?.([200, 100, 200]);
      beep();
      onDone();
      return;
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused, onDone]);
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div
      className="flex items-center justify-between rounded-card bg-tinta p-4 text-nevoa"
      role="timer"
      aria-live="polite"
      aria-label={`Descanso: ${left} segundos`}
    >
      <div className="flex items-center gap-3">
        <Timer className="size-6 text-cume" aria-hidden />
        <span className="font-display text-2xl tabular-nums">
          {mm}:{ss}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-nevoa hover:bg-white/10"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Retomar' : 'Pausar'}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-nevoa hover:bg-white/10"
          onClick={() => setLeft((l) => l + 15)}
        >
          +15 s
        </Button>
        <Button variant="accent" size="sm" onClick={onDone}>
          Pular
        </Button>
      </div>
    </div>
  );
}

function FeedbackForm({ onSubmit, busy }: { onSubmit: (f: FeedbackInput) => void; busy: boolean }) {
  const [rating, setRating] = useState(0);
  const [effort, setEffort] = useState(7);
  const [pain, setPain] = useState(false);
  const [where, setWhere] = useState('');
  const [comment, setComment] = useState('');
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <h2 className="font-display text-2xl">Como foi o treino?</h2>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Nota (obrigatória)</legend>
          <div className="flex gap-2" role="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} de 5`}
                onClick={() => setRating(n)}
                className={`size-12 rounded-control border text-xl ${rating >= n ? 'border-accent bg-accent text-accent-foreground' : 'border-input'}`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={`Esforço percebido: ${effort}/10`}>
          <input
            type="range"
            min={1}
            max={10}
            value={effort}
            onChange={(e) => setEffort(Number(e.target.value))}
            className="h-11 accent-[var(--vt-action)]"
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <Switch checked={pain} onCheckedChange={setPain} aria-label="Sentiu dor?" /> Sentiu dor?
        </label>
        {pain ? (
          <Field label="Onde?">
            <Input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="Ex.: joelho direito"
            />
          </Field>
        ) : null}
        <Field label="Comentário (opcional)">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Button
          variant="accent"
          size="lg"
          disabled={!rating}
          loading={busy}
          onClick={() =>
            onSubmit({
              rating,
              perceivedEffort: effort,
              hasPain: pain,
              painLocation: pain ? where || null : null,
              comment: comment || null,
            })
          }
        >
          Enviar e finalizar
        </Button>
      </CardContent>
    </Card>
  );
}

/** Celebração de recorde pessoal com o símbolo da marca. */
export function Celebration({ records, onClose }: { records: RecordHit[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/95 p-6 text-nevoa"
      role="dialog"
      aria-modal
      aria-labelledby="pr-title"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="animate-bounce">
          <LogoSymbol size={96} color="#C6F432" title="Conquista" />
        </div>
        <h2 id="pr-title" className="font-display text-2xl text-cume">
          Recorde pessoal!
        </h2>
        <ul className="flex flex-col gap-1">
          {records.map((r, i) => (
            <li key={i}>
              {r.exerciseName}: {RECORD_LABEL[r.type]} de{' '}
              <strong>{r.value.toLocaleString('pt-BR')} kg</strong>
            </li>
          ))}
        </ul>
        <Button variant="accent" size="lg" onClick={onClose}>
          Bora pro próximo!
        </Button>
      </div>
    </div>
  );
}

/**
 * Player do treino. Guarda o progresso no localStorage (retoma se a aba fechar)
 * e envia a sessão uma vez, com clientSessionId (o servidor ignora repetições).
 */
export function Player({
  program,
  routine,
  equivalents,
  onSubmit,
  storageKey,
}: {
  program: ApiProgram;
  routine: ApiRoutine;
  equivalents?: (exerciseId: string) => Promise<{ id: string; name: string }[]>;
  onSubmit: (s: SyncSessionInput) => Promise<{ records: RecordHit[] }>;
  storageKey: string;
}) {
  const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
  const init = saved
    ? (JSON.parse(saved) as {
        items: PlayerItem[];
        pos: Position;
        startedAt: string;
        clientId: string;
      })
    : null;
  const [items, setItems] = useState<PlayerItem[]>(init?.items ?? buildPlayer(routine));
  const [pos, setPos] = useState<Position>(init?.pos ?? { item: 0, set: 0 });
  const [rest, setRest] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<RecordHit[] | null>(null);
  const [done, setDone] = useState(false);
  const [swap, setSwap] = useState<{ id: string; name: string }[] | null>(null);
  const startedAt = useRef(init?.startedAt ?? new Date().toISOString());
  const clientId = useRef(init?.clientId ?? newClientSessionId());

  useEffect(() => {
    if (!done)
      localStorage.setItem(
        storageKey,
        JSON.stringify({ items, pos, startedAt: startedAt.current, clientId: clientId.current }),
      );
  }, [items, pos, done, storageKey]);

  const item = items[pos.item];
  const set = item?.sets[pos.set];
  const prog = progress(items);
  const update = (fn: (draft: PlayerItem[]) => void) =>
    setItems((cur) => {
      const draft = structuredClone(cur);
      fn(draft);
      return draft;
    });
  const advance = (draft: PlayerItem[]) => {
    const next = nextPosition(draft, pos);
    if (next) setPos(next);
    else setFinishing(true);
  };
  const endRest = useCallback(() => setRest(null), []);

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <LogoSymbol size={56} color="currentColor" />
          <h2 className="font-display text-2xl">Treino concluído!</h2>
          <p className="text-muted-foreground">Seu personal já recebeu o feedback. Descanse bem.</p>
        </CardContent>
      </Card>
    );
  }

  if (finishing || isFinished(items)) {
    return (
      <>
        <FeedbackForm
          busy={busy}
          onSubmit={async (feedback) => {
            setBusy(true);
            try {
              const r = await onSubmit(
                toSyncPayload(items, {
                  clientSessionId: clientId.current,
                  programId: program.id,
                  routineId: routine.id,
                  startedAt: new Date(startedAt.current),
                  finishedAt: new Date(),
                  feedback,
                }),
              );
              localStorage.removeItem(storageKey);
              if (r.records.length) setRecords(r.records);
              setDone(true);
            } finally {
              setBusy(false);
            }
          }}
        />
        {records ? <Celebration records={records} onClose={() => setRecords(null)} /> : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">
          {routine.label}
          {routine.name ? ` · ${routine.name}` : ''}
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {prog.done}/{prog.total} séries
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={prog.done}
        aria-valuemin={0}
        aria-valuemax={prog.total}
        aria-label="Progresso do treino"
      >
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%` }}
        />
      </div>
      {routine.notes ? (
        <p className="rounded-control bg-muted p-3 text-sm">{routine.notes}</p>
      ) : null}
      {rest !== null ? <RestTimer seconds={rest} onDone={endRest} /> : null}

      {item && set ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            {item.media?.video || item.media?.gif ? (
              item.media.gif && !item.media.video?.endsWith('.m3u8') ? (
                <img
                  src={item.media.gif}
                  alt={`Demonstração: ${item.name}`}
                  className="max-h-72 w-full rounded-card object-contain"
                />
              ) : (
                <video
                  src={item.media.video ?? undefined}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="max-h-72 w-full rounded-card bg-black"
                  aria-label={`Vídeo: ${item.name}`}
                />
              )
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-xl">{item.name}</h3>
              {item.groupKey ? (
                <Badge variant="action">{item.method === 'CIRCUIT' ? 'Circuito' : 'Bi-set'}</Badge>
              ) : null}
              <Badge variant="outline">
                Série {pos.set + 1} de {item.sets.length}
                {set.type === 'WARMUP'
                  ? ' · aquecimento'
                  : set.type === 'DROP'
                    ? ' · drop'
                    : set.type === 'FAILURE'
                      ? ' · até a falha'
                      : ''}
              </Badge>
            </div>
            {set.targetReps ? (
              <p className="text-sm text-muted-foreground">
                Meta: {set.targetReps} reps{set.targetLoadKg ? ` · ${set.targetLoadKg} kg` : ''}
              </p>
            ) : null}
            {item.notes ? <p className="text-sm">{item.notes}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Carga (kg)">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  className="h-14 text-2xl"
                  value={set.loadKg ?? ''}
                  onChange={(e) =>
                    update(
                      (d) =>
                        void (d[pos.item]!.sets[pos.set]!.loadKg =
                          e.target.value === '' ? null : Number(e.target.value)),
                    )
                  }
                />
              </Field>
              <Field label="Repetições">
                <Input
                  type="number"
                  inputMode="numeric"
                  className="h-14 text-2xl"
                  value={set.reps ?? ''}
                  onChange={(e) =>
                    update(
                      (d) =>
                        void (d[pos.item]!.sets[pos.set]!.reps =
                          e.target.value === '' ? null : Number(e.target.value)),
                    )
                  }
                />
              </Field>
            </div>
            <Button
              variant="accent"
              size="lg"
              onClick={() =>
                update((d) => {
                  d[pos.item]!.sets[pos.set]!.done = true;
                  setRest(set.restSeconds);
                  advance(d);
                })
              }
            >
              Concluir série
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update((d) => {
                    d[pos.item]!.sets[pos.set]!.skipped = true;
                    advance(d);
                  })
                }
              >
                <SkipForward /> Pular série
              </Button>
              {equivalents ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => setSwap(await equivalents(item.originalExerciseId))}
                >
                  <Repeat /> Trocar exercício
                </Button>
              ) : null}
            </div>
            {swap ? (
              <div className="flex flex-col gap-2 rounded-control border border-border p-3">
                <p className="text-sm font-medium">Equivalentes sugeridos</p>
                {swap.length ? (
                  swap.map((e) => (
                    <Button
                      key={e.id}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        update((d) => {
                          d[pos.item]!.exerciseId = e.id;
                          d[pos.item]!.name = e.name;
                          d[pos.item]!.media = null;
                        });
                        setSwap(null);
                      }}
                    >
                      {e.name}
                    </Button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum equivalente encontrado.</p>
                )}
              </div>
            ) : null}
            <Field label="Anotação do exercício">
              <Input
                value={item.note}
                onChange={(e) => update((d) => void (d[pos.item]!.note = e.target.value))}
                placeholder="Ex.: aparelho ocupado, usei halteres"
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <ol className="flex flex-col gap-1" aria-label="Exercícios do treino">
        {items.map((it, i) => (
          <li key={it.itemId}>
            <button
              type="button"
              onClick={() =>
                setPos({
                  item: i,
                  set: Math.max(
                    0,
                    it.sets.findIndex((s) => !s.done && !s.skipped),
                  ),
                })
              }
              className={`flex w-full min-h-11 items-center justify-between rounded-control px-3 text-left ${i === pos.item ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}
            >
              <span>
                {i + 1}. {it.name}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {it.sets.filter((s) => s.done).length}/{it.sets.length}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <Button variant="secondary" onClick={() => setFinishing(true)}>
        Finalizar treino
      </Button>
    </div>
  );
}
