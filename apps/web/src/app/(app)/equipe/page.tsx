'use client';

import {
  ASSISTANT_PERMISSION_LABEL,
  ASSISTANT_PERMISSIONS,
  type AssistantPermission,
} from '@vetta/contracts';
import { useFeature } from '@vetta/sdk/react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Label,
  LockedFeature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vetta/ui';
import { Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { fmtDateTime, useApi, useApiMutation } from '@/lib/api';
import { useActiveTenant } from '@/lib/session';

interface Member {
  id: string;
  role: 'OWNER' | 'ASSISTANT';
  status: 'INVITED' | 'ACTIVE' | 'REMOVED';
  name: string;
  email: string;
  permissions: AssistantPermission[];
  assignedStudents: number;
  lastLoginAt: string | null;
}

interface Activity {
  id: string;
  at: string;
  actorName: string | null;
  role: string | null;
  resource: string;
  action: string;
  studentLinkId: string | null;
}

const RESOURCE_LABEL: Record<string, string> = {
  students: 'aluno',
  workouts: 'treino',
  anamnesis: 'anamnese',
  assessments: 'avaliação',
  progress: 'evolução',
  schedule: 'agenda',
  documents: 'documento',
  library: 'biblioteca',
  groups: 'grupo',
  team: 'equipe',
  brand: 'marca',
  settings: 'configurações',
};
const ACTION_LABEL: Record<string, string> = {
  create: 'criou',
  update: 'alterou',
  delete: 'removeu',
  manage: 'alterou',
  read: 'consultou',
};

/** Equipe: convites, permissões por assistente, atribuição de alunos e log de alterações. */
export default function TeamPage() {
  const { tenantId } = useActiveTenant();
  const feature = useFeature(tenantId, 'team.assistants');
  const ready = !feature.loading;
  const team = useApi<{ limit: number; used: number; members: Member[] }>('/v1/team', {
    enabled: ready,
  });
  const students = useApi<{
    items: { id: string; displayName: string; assistantMemberId: string | null }[];
  }>('/v1/students?limit=200', { enabled: ready });
  const [filter, setFilter] = useState<string>('all');
  const activity = useApi<{ items: Activity[] }>(
    `/v1/team/activity${filter !== 'all' ? `?memberId=${filter}` : ''}`,
    { enabled: ready },
  );
  const [invite, setInvite] = useState({
    name: '',
    email: '',
    permissions: [...ASSISTANT_PERMISSIONS] as AssistantPermission[],
  });
  const [link, setLink] = useState<string | null>(null);
  const send = useApiMutation<object, { inviteUrl: string }>('POST', '/v1/team/invites', {
    invalidate: ['/v1/team'],
    success: 'Convite enviado por e-mail.',
    onSuccess: (r) => {
      setLink(r.inviteUrl);
      setInvite({ name: '', email: '', permissions: [...ASSISTANT_PERMISSIONS] });
    },
  });
  const update = useApiMutation<{ id: string; permissions: AssistantPermission[] }>(
    'PATCH',
    (b) => `/v1/team/members/${b.id}`,
    { invalidate: ['/v1/team'], success: 'Permissões atualizadas.' },
  );
  const remove = useApiMutation<string>('DELETE', (id) => `/v1/team/members/${id}`, {
    invalidate: ['/v1/team', '/v1/students'],
    success: 'Assistente removido. Os alunos voltaram para você.',
  });
  const assign = useApiMutation<{ studentLinkIds: string[]; memberId: string | null }>(
    'POST',
    '/v1/team/assignments',
    { invalidate: ['/v1/students', '/v1/team'] },
  );

  const assistants = (team.data?.members ?? []).filter((m) => m.role === 'ASSISTANT');
  const nameOf = (id: string | null) =>
    assistants.find((a) => a.id === id)?.name ?? 'Você (personal)';
  const limitReached = !!team.data && team.data.limit !== -1 && team.data.used >= team.data.limit;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl">Equipe</h1>
        <p className="text-muted-foreground">
          Assistentes acompanham só os alunos atribuídos e nunca veem financeiro, marca ou
          assinatura.
        </p>
      </div>
      <LockedFeature
        locked={!feature.loading && team.data?.limit === 0}
        loading={feature.loading}
        title="Equipe de assistentes"
        requiredPlan="PRO_PLUS"
      >
        <Card>
          <CardHeader>
            <CardTitle>Convidar assistente</CardTitle>
            {team.data ? (
              <CardDescription>
                {team.data.used} de {team.data.limit === -1 ? 'ilimitados' : team.data.limit}{' '}
                assistentes.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate(invite);
              }}
            >
              <Field label="Nome">
                <Input
                  required
                  minLength={2}
                  value={invite.name}
                  onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  required
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                />
              </Field>
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="mb-1 text-sm font-medium">O que pode fazer</legend>
                {ASSISTANT_PERMISSIONS.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <Checkbox
                      id={`inv-${p}`}
                      checked={invite.permissions.includes(p)}
                      onCheckedChange={(v) =>
                        setInvite({
                          ...invite,
                          permissions: v
                            ? [...invite.permissions, p]
                            : invite.permissions.filter((x) => x !== p),
                        })
                      }
                    />
                    <Label htmlFor={`inv-${p}`}>{ASSISTANT_PERMISSION_LABEL[p]}</Label>
                  </div>
                ))}
              </fieldset>
              <div className="sm:col-span-2">
                <Button type="submit" loading={send.isPending} disabled={limitReached}>
                  <UserPlus aria-hidden /> Enviar convite
                </Button>
                {limitReached ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Limite de assistentes do plano atingido.
                  </p>
                ) : null}
              </div>
            </form>
            {link ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-control bg-muted p-3 text-sm">
                <span className="break-all">{link}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard.writeText(link)}
                >
                  <Copy aria-hidden /> Copiar link
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assistentes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!assistants.length ? (
              <EmptyState
                title="Nenhum assistente ainda"
                description="Convide alguém para dividir o acompanhamento dos alunos."
              />
            ) : (
              assistants.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-3 rounded-card border border-border p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-sm text-muted-foreground">{m.email}</span>
                    <Badge variant={m.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {m.status === 'ACTIVE' ? 'ativo' : 'convite pendente'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {m.assignedStudents} aluno(s) · último acesso {fmtDateTime(m.lastLoginAt)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {ASSISTANT_PERMISSIONS.map((p) => (
                      <div key={p} className="flex items-center gap-2">
                        <Checkbox
                          id={`${m.id}-${p}`}
                          checked={m.permissions.includes(p)}
                          onCheckedChange={(v) =>
                            update.mutate({
                              id: m.id,
                              permissions: v
                                ? [...m.permissions, p]
                                : m.permissions.filter((x) => x !== p),
                            })
                          }
                        />
                        <Label htmlFor={`${m.id}-${p}`}>{ASSISTANT_PERMISSION_LABEL[p]}</Label>
                      </div>
                    ))}
                  </div>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remover ${m.name} da equipe?`)) remove.mutate(m.id);
                      }}
                    >
                      Remover da equipe
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alunos por responsável</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(students.data?.items ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.displayName}</TableCell>
                    <TableCell>
                      <Select
                        value={s.assistantMemberId ?? 'owner'}
                        onValueChange={(v) =>
                          assign.mutate({
                            studentLinkIds: [s.id],
                            memberId: v === 'owner' ? null : v,
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`Responsável por ${s.displayName}`}
                          className="max-w-64"
                        >
                          <SelectValue>{nameOf(s.assistantMemberId)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Você (personal)</SelectItem>
                          {assistants.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Quem alterou o quê</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger aria-label="Filtrar por pessoa" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda a equipe</SelectItem>
                {(team.data?.members ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.role === 'OWNER' ? 'Você' : m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {(activity.data?.items ?? []).map((a) => {
                const student = students.data?.items.find((s) => s.id === a.studentLinkId);
                return (
                  <li key={a.id} className="flex flex-wrap gap-x-2 py-2 text-sm">
                    <span className="text-muted-foreground">{fmtDateTime(a.at)}</span>
                    <span className="font-medium">{a.actorName ?? '—'}</span>
                    <span>
                      {ACTION_LABEL[a.action] ?? a.action}{' '}
                      {RESOURCE_LABEL[a.resource] ?? a.resource}
                    </span>
                    {student ? (
                      <span className="text-muted-foreground">· {student.displayName}</span>
                    ) : null}
                  </li>
                );
              })}
              {!activity.data?.items.length ? (
                <li className="py-2 text-sm text-muted-foreground">Nenhuma alteração ainda.</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </LockedFeature>
    </div>
  );
}
