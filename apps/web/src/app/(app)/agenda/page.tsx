'use client';

import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetta/ui';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fmtDateTime, localDay, useApi, useApiMutation } from '@/lib/api';
import { useActiveRole } from '@/lib/role';
import { useActiveTenant } from '@/lib/session';

interface Attendee {
  id: string;
  studentLinkId: string;
  status: 'BOOKED' | 'CONFIRMED' | 'CANCELED' | 'ATTENDED' | 'NO_SHOW';
  studentLink?: { displayName: string };
}
interface Appointment {
  id: string;
  title: string;
  type: 'IN_PERSON' | 'ONLINE';
  status: 'SCHEDULED' | 'CONFIRMED' | 'CANCELED' | 'DONE' | 'NO_SHOW';
  startsAt: string;
  endsAt: string;
  location: string | null;
  meetingUrl: string | null;
  capacity: number;
  recurrenceRule: string | null;
  recurrenceParentId: string | null;
  attendees: Attendee[];
}

const TZ = 'America/Sao_Paulo';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY = 86_400_000;
const time = (d: string) =>
  new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayKey = (d: string | Date) => localDay(new Date(d));
const ATT_LABEL: Record<Attendee['status'], string> = {
  BOOKED: 'reservado',
  CONFIRMED: 'confirmado',
  CANCELED: 'cancelou',
  ATTENDED: 'presente',
  NO_SHOW: 'faltou',
};

type View = 'day' | 'week' | 'month';

function rangeOf(view: View, anchor: string) {
  const a = new Date(`${anchor}T12:00:00Z`);
  if (view === 'day') return { start: anchor, days: 1 };
  if (view === 'week') {
    const start = new Date(a.getTime() - a.getUTCDay() * DAY);
    return { start: start.toISOString().slice(0, 10), days: 7 };
  }
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1, 12));
  const start = new Date(first.getTime() - first.getUTCDay() * DAY);
  return { start: start.toISOString().slice(0, 10), days: 42 };
}

function AppointmentDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const a = useApi<Appointment>(`/v1/schedule/appointments/${id}`);
  const [marks, setMarks] = useState<Record<string, 'ATTENDED' | 'NO_SHOW'>>({});
  const attendance = useApiMutation<object>('POST', `/v1/schedule/appointments/${id}/attendance`, {
    invalidate: ['/v1/schedule'],
    success: 'Presença registrada.',
  });
  const cancel = useApiMutation<{ scope: string }>(
    'POST',
    `/v1/schedule/appointments/${id}/cancel`,
    { invalidate: ['/v1/schedule'], success: 'Aula cancelada.', onSuccess: onClose },
  );
  if (!a.data) return <Skeleton className="h-32" />;
  const d = a.data;
  const active = d.attendees.filter((x) => x.status !== 'CANCELED');
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        {fmtDateTime(d.startsAt)} – {time(d.endsAt)} ·{' '}
        {d.type === 'ONLINE' ? 'Online' : 'Presencial'}
      </p>
      {d.location ? <p>Local: {d.location}</p> : null}
      {d.meetingUrl ? (
        <a className="text-link underline" href={d.meetingUrl} target="_blank" rel="noreferrer">
          Link da chamada
        </a>
      ) : null}
      <p className="font-semibold">
        Alunos ({active.length}/{d.capacity})
      </p>
      <ul className="flex flex-col gap-2">
        {d.attendees.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-2">
            <span className="flex-1">{x.studentLink?.displayName}</span>
            <Badge variant="outline">{ATT_LABEL[x.status]}</Badge>
            {x.status !== 'CANCELED' ? (
              <Select
                value={marks[x.studentLinkId] ?? ''}
                onValueChange={(v) => setMarks({ ...marks, [x.studentLinkId]: v as 'ATTENDED' })}
              >
                <SelectTrigger
                  className="h-9 w-36"
                  aria-label={`Presença de ${x.studentLink?.displayName}`}
                >
                  <SelectValue placeholder="Presença" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATTENDED">Presente</SelectItem>
                  <SelectItem value="NO_SHOW">Faltou</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!Object.keys(marks).length}
          loading={attendance.isPending}
          onClick={() =>
            attendance.mutate({
              items: Object.entries(marks).map(([studentLinkId, status]) => ({
                studentLinkId,
                status,
              })),
            })
          }
        >
          Salvar presença
        </Button>
        {d.status !== 'CANCELED' ? (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                confirm('Cancelar esta aula? Os alunos serão avisados.') &&
                cancel.mutate({ scope: 'one' })
              }
            >
              Cancelar aula
            </Button>
            {d.recurrenceRule || d.recurrenceParentId ? (
              <Button
                variant="ghost"
                onClick={() =>
                  confirm('Cancelar esta e as próximas da série?') &&
                  cancel.mutate({ scope: 'following' })
                }
              >
                Cancelar esta e as seguintes
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function NewAppointment({ onDone }: { onDone: () => void }) {
  const students = useApi<{ items: { id: string; displayName: string }[] }>(
    '/v1/students?status=ACTIVE',
  );
  const [f, setF] = useState({
    title: 'Aula',
    type: 'IN_PERSON',
    date: localDay(),
    start: '07:00',
    duration: '60',
    location: '',
    meetingUrl: '',
    capacity: '1',
    students: [] as string[],
    repeat: false,
    days: [] as string[],
    count: '8',
  });
  const create = useApiMutation<object>('POST', '/v1/schedule/appointments', {
    invalidate: ['/v1/schedule'],
    success: 'Aula criada.',
    onSuccess: onDone,
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        // Horário de São Paulo (UTC−3) → ISO.
        const startsAt = new Date(`${f.date}T${f.start}:00-03:00`);
        const endsAt = new Date(startsAt.getTime() + Number(f.duration) * 60_000);
        const weekday = RRULE_DAYS[new Date(`${f.date}T12:00:00Z`).getUTCDay()]!;
        create.mutate({
          title: f.title,
          type: f.type,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: f.location || null,
          meetingUrl: f.meetingUrl || null,
          capacity: Number(f.capacity),
          studentLinkIds: f.students,
          recurrenceRule: f.repeat
            ? `FREQ=WEEKLY;BYDAY=${(f.days.length ? f.days : [weekday]).join(',')};COUNT=${f.count}`
            : null,
        });
      }}
    >
      <Field label="Título" className="sm:col-span-2">
        <Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label="Data">
        <Input
          type="date"
          required
          value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })}
        />
      </Field>
      <Field label="Início">
        <Input
          type="time"
          required
          value={f.start}
          onChange={(e) => setF({ ...f, start: e.target.value })}
        />
      </Field>
      <Field label="Duração (min)">
        <Input
          type="number"
          min={15}
          step={15}
          value={f.duration}
          onChange={(e) => setF({ ...f, duration: e.target.value })}
        />
      </Field>
      <Field label="Tipo">
        <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
          <SelectTrigger aria-label="Tipo de aula">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IN_PERSON">Presencial</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {f.type === 'ONLINE' ? (
        <Field label="Link da chamada" className="sm:col-span-2">
          <Input
            type="url"
            value={f.meetingUrl}
            onChange={(e) => setF({ ...f, meetingUrl: e.target.value })}
          />
        </Field>
      ) : (
        <Field label="Local" className="sm:col-span-2">
          <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
      )}
      <Field label="Capacidade" hint="Mais de 1 = turma">
        <Input
          type="number"
          min={1}
          max={100}
          value={f.capacity}
          onChange={(e) => setF({ ...f, capacity: e.target.value })}
        />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Alunos</legend>
        <div className="flex max-h-40 flex-wrap gap-x-4 overflow-y-auto">
          {(students.data?.items ?? []).map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-2">
              <Checkbox
                checked={f.students.includes(s.id)}
                onCheckedChange={(c) =>
                  setF({
                    ...f,
                    students: c ? [...f.students, s.id] : f.students.filter((x) => x !== s.id),
                  })
                }
              />
              {s.displayName}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
        <Checkbox checked={f.repeat} onCheckedChange={(c) => setF({ ...f, repeat: !!c })} /> Repetir
        toda semana
      </label>
      {f.repeat ? (
        <>
          <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Dias</legend>
            {RRULE_DAYS.map((d, i) => (
              <label key={d} className="flex min-h-11 items-center gap-1">
                <Checkbox
                  checked={f.days.includes(d)}
                  onCheckedChange={(c) =>
                    setF({ ...f, days: c ? [...f.days, d] : f.days.filter((x) => x !== d) })
                  }
                />{' '}
                {WEEKDAYS[i]}
              </label>
            ))}
          </fieldset>
          <Field label="Quantas aulas">
            <Input
              type="number"
              min={2}
              max={200}
              value={f.count}
              onChange={(e) => setF({ ...f, count: e.target.value })}
            />
          </Field>
        </>
      ) : null}
      <Button type="submit" loading={create.isPending} className="sm:col-span-2">
        Criar
      </Button>
    </form>
  );
}

function Calendar() {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(localDay());
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const r = rangeOf(view, anchor);
  const from = new Date(`${r.start}T03:00:00Z`);
  const to = new Date(from.getTime() + r.days * DAY);
  const list = useApi<Appointment[]>(
    `/v1/schedule/appointments?from=${from.toISOString()}&to=${to.toISOString()}`,
  );
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of list.data ?? []) {
      const k = dayKey(a.startsAt);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [list.data]);
  const days = Array.from({ length: r.days }, (_, i) =>
    new Date(from.getTime() + i * DAY + 12 * 3_600_000).toISOString().slice(0, 10),
  );
  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30;
  const move = (n: number) =>
    setAnchor(
      new Date(new Date(`${anchor}T12:00:00Z`).getTime() + n * step * DAY)
        .toISOString()
        .slice(0, 10),
    );
  const month = new Date(`${anchor}T12:00:00Z`).getUTCMonth();
  const title = new Date(`${anchor}T12:00:00Z`).toLocaleDateString(
    'pt-BR',
    view === 'month'
      ? { month: 'long', year: 'numeric', timeZone: 'UTC' }
      : { day: '2-digit', month: 'long', timeZone: 'UTC' },
  );

  const Item = ({ a }: { a: Appointment }) => (
    <button
      type="button"
      onClick={() => setOpen(a.id)}
      className={cn(
        'w-full rounded-control px-2 py-1 text-left text-xs',
        a.status === 'CANCELED'
          ? 'bg-muted line-through opacity-60'
          : a.capacity > 1
            ? 'bg-action text-action-foreground'
            : 'bg-primary text-primary-foreground',
      )}
    >
      <span className="font-semibold">{time(a.startsAt)}</span> {a.title}
      {a.capacity > 1
        ? ` (${a.attendees.filter((x) => x.status !== 'CANCELED').length}/${a.capacity})`
        : ''}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Anterior" onClick={() => move(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="secondary" onClick={() => setAnchor(localDay())}>
          Hoje
        </Button>
        <Button variant="secondary" size="icon" aria-label="Próximo" onClick={() => move(1)}>
          <ChevronRight />
        </Button>
        <p className="flex-1 font-display text-xl capitalize">{title}</p>
        <Select value={view} onValueChange={(v) => setView(v as View)}>
          <SelectTrigger className="w-32" aria-label="Visualização">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Dia</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Nova aula
        </Button>
      </div>
      {!list.data ? (
        <Skeleton className="h-96" />
      ) : view === 'day' ? (
        <ul className="flex flex-col gap-2">
          {(byDay.get(anchor) ?? []).map((a) => (
            <li key={a.id}>
              <Item a={a} />
            </li>
          ))}
          {!(byDay.get(anchor) ?? []).length ? (
            <li className="text-muted-foreground">Nada agendado.</li>
          ) : null}
        </ul>
      ) : (
        <div className="grid grid-cols-7 gap-1 overflow-x-auto">
          {WEEKDAYS.map((w) => (
            <p key={w} className="p-1 text-center text-xs font-semibold text-muted-foreground">
              {w}
            </p>
          ))}
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                'flex min-h-24 flex-col gap-1 rounded-control border border-border p-1',
                view === 'week' && 'min-h-64',
                view === 'month' &&
                  new Date(`${d}T12:00:00Z`).getUTCMonth() !== month &&
                  'opacity-50',
                d === localDay() && 'border-action',
              )}
            >
              <button
                type="button"
                className="self-start text-xs font-semibold hover:underline"
                onClick={() => {
                  setAnchor(d);
                  setView('day');
                }}
              >
                {Number(d.slice(8))}
              </button>
              {(byDay.get(d) ?? []).map((a) => (
                <Item key={a.id} a={a} />
              ))}
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aula</DialogTitle>
          </DialogHeader>
          {open ? <AppointmentDialog id={open} onClose={() => setOpen(null)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova aula</DialogTitle>
          </DialogHeader>
          <NewAppointment onDone={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Rule {
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
  type: 'IN_PERSON' | 'ONLINE';
  location: string | null;
  meetingUrl: string | null;
  capacity: number;
}
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

function Availability() {
  const rules = useApi<Rule[]>('/v1/schedule/availability');
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const save = useApiMutation<object>('PUT', '/v1/schedule/availability', {
    invalidate: ['/v1/schedule'],
    success: 'Disponibilidade salva.',
    onSuccess: () => setDraft(null),
  });
  const settings = useApi<{ bookingMinHours: number; cancelMinHours: number }>(
    '/v1/schedule/settings',
  );
  const saveSettings = useApiMutation<object>('PUT', '/v1/schedule/settings', {
    invalidate: ['/v1/schedule/settings'],
    success: 'Política salva.',
  });
  const blocks = useApi<{ id: string; startsAt: string; endsAt: string; reason: string | null }[]>(
    `/v1/schedule/blocks?from=${new Date().toISOString()}&to=${new Date(Date.now() + 365 * DAY).toISOString()}`,
  );
  const addBlock = useApiMutation<object>('POST', '/v1/schedule/blocks', {
    invalidate: ['/v1/schedule'],
    success: 'Bloqueio criado.',
  });
  const delBlock = useApiMutation<string>('DELETE', (id) => `/v1/schedule/blocks/${id}`, {
    invalidate: ['/v1/schedule'],
  });
  const [blk, setBlk] = useState({ from: '', to: '', reason: '' });
  const [policy, setPolicy] = useState<{ bookingMinHours: number; cancelMinHours: number } | null>(
    null,
  );
  if (!rules.data) return <Skeleton className="h-48" />;
  const list = draft ?? rules.data;
  const update = (i: number, patch: Partial<Rule>) =>
    setDraft(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const p = policy ?? settings.data;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Horários disponíveis por semana</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {list.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="Dia">
                <Select
                  value={String(r.weekday)}
                  onValueChange={(v) => update(i, { weekday: Number(v) })}
                >
                  <SelectTrigger className="w-28" aria-label="Dia">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((w, j) => (
                      <SelectItem key={w} value={String(j)}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Das">
                <Input
                  type="time"
                  value={hhmm(r.startMinute)}
                  onChange={(e) => update(i, { startMinute: toMin(e.target.value) })}
                />
              </Field>
              <Field label="Às">
                <Input
                  type="time"
                  value={hhmm(r.endMinute)}
                  onChange={(e) => update(i, { endMinute: toMin(e.target.value) })}
                />
              </Field>
              <Field label="Aula (min)">
                <Input
                  type="number"
                  min={15}
                  step={15}
                  className="w-24"
                  value={r.slotMinutes}
                  onChange={(e) => update(i, { slotMinutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tipo">
                <Select
                  value={r.type}
                  onValueChange={(v) => update(i, { type: v as Rule['type'] })}
                >
                  <SelectTrigger className="w-32" aria-label="Tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN_PERSON">Presencial</SelectItem>
                    <SelectItem value="ONLINE">Online</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={r.type === 'ONLINE' ? 'Link' : 'Local'}>
                <Input
                  value={(r.type === 'ONLINE' ? r.meetingUrl : r.location) ?? ''}
                  onChange={(e) =>
                    update(
                      i,
                      r.type === 'ONLINE'
                        ? { meetingUrl: e.target.value || null }
                        : { location: e.target.value || null },
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover horário"
                onClick={() => setDraft(list.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setDraft([
                  ...list,
                  {
                    weekday: 1,
                    startMinute: 420,
                    endMinute: 660,
                    slotMinutes: 60,
                    type: 'IN_PERSON',
                    location: null,
                    meetingUrl: null,
                    capacity: 1,
                  },
                ])
              }
            >
              <Plus /> Adicionar horário
            </Button>
            <Button
              disabled={!draft}
              loading={save.isPending}
              onClick={() =>
                save.mutate({
                  rules: list.map((r) => ({
                    ...r,
                    meetingUrl: r.meetingUrl || null,
                    location: r.location || null,
                  })),
                })
              }
            >
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Política de agendamento</CardTitle>
        </CardHeader>
        <CardContent>
          {p ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveSettings.mutate(p);
              }}
            >
              <Field label="Agendar com antecedência mínima (h)">
                <Input
                  type="number"
                  min={0}
                  value={p.bookingMinHours}
                  onChange={(e) => setPolicy({ ...p, bookingMinHours: Number(e.target.value) })}
                />
              </Field>
              <Field label="Cancelar até (h antes)">
                <Input
                  type="number"
                  min={0}
                  value={p.cancelMinHours}
                  onChange={(e) => setPolicy({ ...p, cancelMinHours: Number(e.target.value) })}
                />
              </Field>
              <Button type="submit" variant="secondary" loading={saveSettings.isPending}>
                Salvar
              </Button>
            </form>
          ) : (
            <Skeleton className="h-12" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Bloqueios (férias, compromissos)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addBlock.mutate({
                startsAt: new Date(`${blk.from}:00-03:00`).toISOString(),
                endsAt: new Date(`${blk.to}:00-03:00`).toISOString(),
                ...(blk.reason ? { reason: blk.reason } : {}),
              });
            }}
          >
            <Field label="De">
              <Input
                type="datetime-local"
                required
                value={blk.from}
                onChange={(e) => setBlk({ ...blk, from: e.target.value })}
              />
            </Field>
            <Field label="Até">
              <Input
                type="datetime-local"
                required
                value={blk.to}
                onChange={(e) => setBlk({ ...blk, to: e.target.value })}
              />
            </Field>
            <Field label="Motivo">
              <Input
                value={blk.reason}
                onChange={(e) => setBlk({ ...blk, reason: e.target.value })}
              />
            </Field>
            <Button type="submit" variant="secondary" loading={addBlock.isPending}>
              Bloquear
            </Button>
          </form>
          <ul className="divide-y divide-border text-sm">
            {(blocks.data ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2">
                <span className="flex-1">
                  {fmtDateTime(b.startsAt)} → {fmtDateTime(b.endsAt)}{' '}
                  {b.reason ? `· ${b.reason}` : ''}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover bloqueio"
                  onClick={() => delBlock.mutate(b.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

interface Slots {
  slots: { startsAt: string; endsAt: string; type: string; location: string | null }[];
  classes: {
    appointmentId: string;
    title: string;
    startsAt: string;
    spotsLeft: number;
    type: string;
  }[];
}

function StudentSchedule() {
  const from = new Date();
  const to = new Date(Date.now() + 14 * DAY);
  const slots = useApi<Slots>(
    `/v1/schedule/slots?from=${from.toISOString()}&to=${to.toISOString()}`,
  );
  const mine = useApi<Appointment[]>(
    `/v1/schedule/appointments?from=${new Date(Date.now() - DAY).toISOString()}&to=${new Date(Date.now() + 60 * DAY).toISOString()}`,
  );
  const book = useApiMutation<object>('POST', '/v1/schedule/book', {
    invalidate: ['/v1/schedule'],
    success: 'Aula agendada!',
  });
  const confirmA = useApiMutation<string>(
    'POST',
    (id) => `/v1/schedule/appointments/${id}/confirm`,
    { invalidate: ['/v1/schedule'], success: 'Presença confirmada.' },
  );
  const leave = useApiMutation<string>('POST', (id) => `/v1/schedule/appointments/${id}/leave`, {
    invalidate: ['/v1/schedule'],
    success: 'Aula cancelada.',
  });
  const grouped = useMemo(() => {
    const m = new Map<string, Slots['slots']>();
    for (const s of slots.data?.slots ?? [])
      m.set(dayKey(s.startsAt), [...(m.get(dayKey(s.startsAt)) ?? []), s]);
    return [...m.entries()];
  }, [slots.data]);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Minhas aulas</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {(mine.data ?? [])
              .filter((a) => a.status !== 'CANCELED')
              .map((a) => {
                const me = a.attendees[0];
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3"
                  >
                    <span className="flex-1">
                      <strong>{fmtDateTime(a.startsAt)}</strong> · {a.title}
                    </span>
                    {a.meetingUrl ? (
                      <a
                        className="text-link underline"
                        href={a.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Entrar
                      </a>
                    ) : null}
                    {me ? <Badge variant="outline">{ATT_LABEL[me.status]}</Badge> : null}
                    {me?.status === 'BOOKED' ? (
                      <Button size="sm" variant="accent" onClick={() => confirmA.mutate(a.id)}>
                        Confirmar
                      </Button>
                    ) : null}
                    {me && ['BOOKED', 'CONFIRMED'].includes(me.status) ? (
                      <Button size="sm" variant="ghost" onClick={() => leave.mutate(a.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            {!mine.data?.length ? (
              <li className="text-muted-foreground">Nenhuma aula marcada.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>
      {slots.data?.classes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Turmas com vaga</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {slots.data.classes.map((c) => (
              <div key={c.appointmentId} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {fmtDateTime(c.startsAt)} · {c.title} ({c.spotsLeft} vagas)
                </span>
                <Button
                  size="sm"
                  variant="accent"
                  onClick={() =>
                    book.mutate({ startsAt: c.startsAt, appointmentId: c.appointmentId })
                  }
                >
                  Entrar na turma
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Horários livres (próximos 14 dias)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!slots.data ? (
            <Skeleton className="h-24" />
          ) : grouped.length ? (
            grouped.map(([d, list]) => (
              <div key={d}>
                <p className="mb-2 font-semibold capitalize">
                  {new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    timeZone: 'UTC',
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <Button
                      key={s.startsAt}
                      variant="secondary"
                      loading={
                        book.isPending &&
                        book.variables &&
                        (book.variables as { startsAt: string }).startsAt === s.startsAt
                      }
                      onClick={() => book.mutate({ startsAt: s.startsAt })}
                    >
                      {time(s.startsAt)}
                    </Button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">
              Sem horários livres agora. Fale com seu personal pelo chat.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SchedulePage() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'schedule.calendar');
  const role = useActiveRole();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Agenda</h1>
      <LockedFeature
        locked={feature.locked}
        title="Agenda"
        requiredPlan="PRO"
        description="Aulas presenciais e online, turmas e recorrência."
      >
        {role === 'ALUNO' ? (
          <StudentSchedule />
        ) : (
          <Tabs defaultValue="calendario">
            <TabsList>
              <TabsTrigger value="calendario">Calendário</TabsTrigger>
              <TabsTrigger value="disponibilidade">Disponibilidade</TabsTrigger>
            </TabsList>
            <TabsContent value="calendario">
              <Calendar />
            </TabsContent>
            <TabsContent value="disponibilidade">
              <Availability />
            </TabsContent>
          </Tabs>
        )}
      </LockedFeature>
    </div>
  );
}
