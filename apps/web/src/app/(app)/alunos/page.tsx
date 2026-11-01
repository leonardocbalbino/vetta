'use client';

import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@vetta/ui';
import { Copy, MessageCircle, Upload, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { daysAgo, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface StudentRow {
  id: string;
  displayName: string;
  email: string | null;
  whatsapp: string | null;
  status: string;
  goal: string | null;
  tags: string[];
  lastWorkoutAt: string | null;
  groups: { id: string; name: string; color: string | null }[];
}
interface Group {
  id: string;
  name: string;
  _count: { members: number };
}

const STATUS: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'neutral' | 'outline' | 'danger' }
> = {
  ACTIVE: { label: 'Ativo', variant: 'success' },
  INVITED: { label: 'Convidado', variant: 'outline' },
  PAUSED: { label: 'Pausado', variant: 'neutral' },
  OVERDUE: { label: 'Inadimplente', variant: 'danger' },
  ARCHIVED: { label: 'Arquivado', variant: 'neutral' },
};

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [result, setResult] = useState<{ inviteUrl: string; whatsappUrl: string | null } | null>(
    null,
  );
  const invite = useApiMutation<object, { inviteUrl: string; whatsappUrl: string | null }>(
    'POST',
    '/v1/students/invites',
    {
      invalidate: ['/v1/students', '/v1/dashboard'],
      onSuccess: (r) => setResult(r),
    },
  );
  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setResult(null);
      setName('');
      setEmail('');
      setPhone('');
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar aluno</DialogTitle>
          <DialogDescription>
            O aluno define a própria senha no primeiro acesso. O convite vale por 7 dias.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3">
            <Field label="Link do convite">
              <Input readOnly value={result.inviteUrl} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.inviteUrl);
                  toast.success('Link copiado.');
                }}
              >
                <Copy /> Copiar link
              </Button>
              <Button variant="accent" asChild>
                <a
                  href={
                    result.whatsappUrl ??
                    `https://wa.me/?text=${encodeURIComponent(`Seu convite para treinar comigo pela Vetta: ${result.inviteUrl}`)}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle /> Enviar no WhatsApp
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate({
                name,
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
                delivery: email ? 'EMAIL' : 'LINK',
              });
            }}
          >
            <Field label="Nome">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </Field>
            <Field label="E-mail" hint="Com e-mail, o convite chega na caixa de entrada.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="WhatsApp" hint="Ex.: +5511999999999">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Button type="submit" loading={invite.isPending}>
              Gerar convite
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [csv, setCsv] = useState('nome;email;whatsapp;objetivo;tags\n');
  const imp = useApiMutation<
    object,
    { rows: number; created: number; errors: { line: number; message: string }[] }
  >('POST', '/v1/students/import', {
    invalidate: ['/v1/students'],
    onSuccess: (r) =>
      toast.success(
        `${r.created} de ${r.rows} alunos importados${r.errors.length ? `; ${r.errors.length} linha(s) com erro` : ''}.`,
      ),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar alunos (CSV)</DialogTitle>
          <DialogDescription>
            Colunas: nome;email;whatsapp;objetivo;tags (tags separadas por |). Quem tiver e-mail
            recebe o convite.
          </DialogDescription>
        </DialogHeader>
        <Field label="Arquivo CSV">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? csv)}
          />
        </Field>
        <Field label="Conteúdo">
          <Textarea
            rows={6}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className="font-mono text-sm"
          />
        </Field>
        <Button loading={imp.isPending} onClick={() => imp.mutate({ csv, sendInvites: true })}>
          Importar
        </Button>
        {imp.data?.errors.length ? (
          <ul className="text-sm text-danger">
            {imp.data.errors.map((e) => (
              <li key={e.line}>
                Linha {e.line}: {e.message}
              </li>
            ))}
          </ul>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StudentsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { tenantId } = useActiveTenant();
  const groupsFeature = useFeature(tenantId, 'students.groups');
  const csvFeature = useFeature(tenantId, 'students.import_csv');
  const limit = useFeature(tenantId, 'students.max');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [groupId, setGroupId] = useState('all');
  const [inactive, setInactive] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [inviteOpen, setInviteOpen] = useState(params.get('convidar') === '1');
  const [importOpen, setImportOpen] = useState(false);
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status !== 'all') p.set('status', status);
    if (groupId !== 'all') p.set('groupId', groupId);
    if (inactive !== 'all') p.set('inactiveDays', inactive);
    return p.toString();
  }, [q, status, groupId, inactive]);
  const list = useApi<{ items: StudentRow[] }>(`/v1/students?${qs}`);
  const groups = useApi<Group[]>('/v1/student-groups');
  const bulk = useApiMutation<object>('POST', '/v1/students/bulk', {
    invalidate: ['/v1/students'],
    success: 'Pronto!',
    onSuccess: () => setSelected([]),
  });
  const items = list.data?.items ?? [];
  const all = items.length > 0 && selected.length === items.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Alunos</h1>
        <div className="flex gap-2">
          <LockedFeature
            locked={csvFeature.locked}
            title="Importar CSV"
            mode="inline"
            requiredPlan="PRO"
          >
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload /> Importar CSV
            </Button>
          </LockedFeature>
          <Button
            onClick={() => {
              if (!limit.hasRoom) {
                toast.error(`Você atingiu o limite de ${limit.max} alunos do seu plano.`, {
                  action: { label: 'Fazer upgrade', onClick: () => router.push('/assinatura') },
                });
                return;
              }
              setInviteOpen(true);
            }}
          >
            <UserPlus /> Convidar aluno
          </Button>
        </div>
      </div>
      {limit.max !== undefined && limit.max !== -1 ? (
        <p className="text-sm text-muted-foreground">
          {limit.used} de {limit.max} alunos do plano.{' '}
          {!limit.hasRoom ? (
            <Link href="/assinatura" className="text-link hover:underline">
              Faça upgrade para convidar mais.
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        <Input
          placeholder="Buscar por nome, e-mail ou tag"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar alunos"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos (exceto arquivados)</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupId} onValueChange={setGroupId} disabled={groupsFeature.locked}>
          <SelectTrigger aria-label="Grupo">
            <SelectValue placeholder="Grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os grupos</SelectItem>
            {(groups.data ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name} ({g._count.members})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={inactive} onValueChange={setInactive}>
          <SelectTrigger aria-label="Último treino">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer último treino</SelectItem>
            <SelectItem value="5">Sem treinar há 5+ dias</SelectItem>
            <SelectItem value="15">Sem treinar há 15+ dias</SelectItem>
            <SelectItem value="30">Sem treinar há 30+ dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.length ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-control bg-muted p-2"
          role="toolbar"
          aria-label="Ações em massa"
        >
          <span className="px-2 text-sm font-medium">{selected.length} selecionado(s)</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const tag = prompt('Tag para adicionar');
              if (tag) bulk.mutate({ ids: selected, action: 'add_tag', tag });
            }}
          >
            Adicionar tag
          </Button>
          {!groupsFeature.locked && groups.data?.length ? (
            <Select
              onValueChange={(g) =>
                bulk.mutate({ ids: selected, action: 'add_to_group', groupId: g })
              }
            >
              <SelectTrigger className="h-9 w-48" aria-label="Adicionar ao grupo">
                <SelectValue placeholder="Adicionar ao grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.data.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => bulk.mutate({ ids: selected, action: 'pause' })}
          >
            Pausar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              confirm('Arquivar os alunos selecionados? Nenhum dado é apagado.') &&
              bulk.mutate({ ids: selected, action: 'archive' })
            }
          >
            Arquivar
          </Button>
        </div>
      ) : null}

      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : !items.length ? (
        <EmptyState
          icon={<Users />}
          title="Nenhum aluno por aqui"
          description="Convide seu primeiro aluno por e-mail, link ou WhatsApp."
          action={<Button onClick={() => setInviteOpen(true)}>Convidar aluno</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={all}
                  onCheckedChange={(v) => setSelected(v ? items.map((i) => i.id) : [])}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último treino</TableHead>
              <TableHead>Tags e grupos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((s) => {
              const d = daysAgo(s.lastWorkoutAt);
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSelected((cur) => (v ? [...cur, s.id] : cur.filter((x) => x !== s.id)))
                      }
                      aria-label={`Selecionar ${s.displayName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/alunos/${s.id}`} className="font-medium hover:underline">
                      {s.displayName}
                    </Link>
                    {s.goal ? (
                      <span className="block text-sm text-muted-foreground">{s.goal}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS[s.status]?.variant ?? 'neutral'}>
                      {STATUS[s.status]?.label ?? s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={d !== null && d >= 5 ? 'text-warning' : undefined}>
                    {d === null ? 'Nunca' : d === 0 ? 'Hoje' : `há ${d} dia${d > 1 ? 's' : ''}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          #{t}
                        </Badge>
                      ))}
                      {s.groups.map((g) => (
                        <Badge key={g.id}>{g.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <StudentsPage />
    </Suspense>
  );
}
