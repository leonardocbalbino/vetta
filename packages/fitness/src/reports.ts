/**
 * Métricas dos relatórios avançados (Pro Plus). Funções puras; datas em UTC e meses
 * no fuso de São Paulo (UTC-3, sem horário de verão).
 */

const SP_OFFSET_MS = 3 * 3_600_000;

/** "AAAA-MM" do instante no fuso de São Paulo. */
export function monthKey(d: Date): string {
  return new Date(d.getTime() - SP_OFFSET_MS).toISOString().slice(0, 7);
}

/** Primeiro instante do mês seguinte a "AAAA-MM" (em UTC, a partir do fuso de SP). */
export function monthEnd(key: string): Date {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) + SP_OFFSET_MS);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export interface CohortMember {
  joinedAt: Date | null;
  /** Saída (arquivado ou cancelado); null = ainda ativo. */
  leftAt: Date | null;
}

export interface CohortRow {
  cohort: string;
  size: number;
  /** % retido em cada mês desde a entrada (0 = mês de entrada), até o mês atual. */
  retention: number[];
}

/**
 * Retenção por coorte de entrada: no deslocamento k, conta quem não saiu antes do fim
 * do mês (coorte + k). Meses futuros não aparecem.
 */
export function cohortRetention(members: CohortMember[], months: number, now: Date): CohortRow[] {
  const current = monthKey(now);
  const first = addMonths(current, -(months - 1));
  const rows: CohortRow[] = [];
  for (let i = 0; i < months; i++) {
    const cohort = addMonths(first, i);
    const group = members.filter((m) => m.joinedAt && monthKey(m.joinedAt) === cohort);
    const offsets = months - i;
    const retention: number[] = [];
    for (let k = 0; k < offsets; k++) {
      const end = monthEnd(addMonths(cohort, k));
      const cut = end.getTime() > now.getTime() ? now : end;
      const kept = group.filter((m) => !m.leftAt || m.leftAt.getTime() >= cut.getTime()).length;
      retention.push(group.length ? Math.round((kept / group.length) * 1000) / 10 : 0);
    }
    rows.push({ cohort, size: group.length, retention });
  }
  return rows;
}

/** Aderência: treinos feitos ÷ previstos, entre 0 e 1 (sem previsão = null). */
export function adherenceRate(planned: number, completed: number): number | null {
  if (planned <= 0) return null;
  return Math.min(1, Math.max(0, completed / planned));
}

export interface ChurnSignals {
  /** Dias desde o último treino (null = nunca treinou). */
  daysSinceLastWorkout: number | null;
  /** Aderência das últimas 4 semanas (0 a 1; null = sem treino previsto). */
  adherence4w: number | null;
  overdueInvoices: number;
  /** Nota média dos últimos treinos (1 a 5). */
  avgRating: number | null;
  painReports: number;
  /** Dias até o fim do plano de consultoria (null = sem plano com fim). */
  planEndsInDays: number | null;
}

export type ChurnLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ChurnRisk {
  score: number;
  level: ChurnLevel;
  reasons: string[];
}

/** Risco de cancelar (0–100) com os motivos, para a lista de alunos em risco. */
export function churnRisk(s: ChurnSignals): ChurnRisk {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (s.daysSinceLastWorkout === null) add(30, 'Ainda não treinou');
  else if (s.daysSinceLastWorkout >= 21) add(40, `Sem treinar há ${s.daysSinceLastWorkout} dias`);
  else if (s.daysSinceLastWorkout >= 10) add(20, `Sem treinar há ${s.daysSinceLastWorkout} dias`);
  if (s.adherence4w !== null && s.adherence4w < 0.4)
    add(20, `Aderência de ${Math.round(s.adherence4w * 100)}% no mês`);
  else if (s.adherence4w !== null && s.adherence4w < 0.7)
    add(10, `Aderência de ${Math.round(s.adherence4w * 100)}% no mês`);
  if (s.overdueInvoices > 0)
    add(
      Math.min(30, 15 * s.overdueInvoices),
      s.overdueInvoices === 1 ? '1 cobrança em atraso' : `${s.overdueInvoices} cobranças em atraso`,
    );
  if (s.avgRating !== null && s.avgRating < 3) add(10, 'Notas baixas nos treinos');
  if (s.painReports >= 2) add(10, 'Relatou dor em vários treinos');
  if (s.planEndsInDays !== null && s.planEndsInDays >= 0 && s.planEndsInDays <= 15)
    add(10, `Plano termina em ${s.planEndsInDays} dias`);
  const final = Math.min(100, score);
  return { score: final, level: final >= 50 ? 'HIGH' : final >= 25 ? 'MEDIUM' : 'LOW', reasons };
}

/** Taxa de inadimplência: valor vencido ÷ valor cobrado no período (0 a 1). */
export function delinquencyRate(overdueCents: number, billedCents: number): number {
  if (billedCents <= 0) return 0;
  return Math.min(1, overdueCents / billedCents);
}
