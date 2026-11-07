import type { PrismaClient } from '@vetta/db';
import { palette } from '@vetta/tokens';
import { createElement as h, type ReactElement } from 'react';
import type { StorageProvider } from '../storage/storage';
import { loadPdfBrand } from './brand';

const METHOD_LABEL: Record<string, string> = {
  STANDARD: '',
  BI_SET: 'Bi-set',
  TRI_SET: 'Tri-set',
  CIRCUIT: 'Circuito',
  DROP_SET: 'Drop-set',
  REST_PAUSE: 'Rest-pause',
  PYRAMID: 'Pirâmide',
  AMRAP: 'AMRAP',
  EMOM: 'EMOM',
  CARDIO: 'Cardio',
};

/**
 * PDF do programa de treino. Com assessment.pdf_branding o cabeçalho leva a logo
 * (ou o nome) e as cores do personal; sem, a marca Vetta.
 */
export async function renderWorkoutPdf(
  deps: { db: PrismaClient; storage: StorageProvider },
  input: { programId: string; tenantId: string; branded: boolean },
): Promise<Buffer> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer, Svg, Polyline, Image } =
    await import('@react-pdf/renderer');
  const p = await deps.db.workoutProgram.findUniqueOrThrow({
    where: { id: input.programId },
    include: {
      tenant: true,
      studentLink: true,
      routines: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          exercises: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            include: {
              exercise: true,
              sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      },
    },
  });
  const { logo, theme: t } = await loadPdfBrand(
    deps.db,
    deps.storage,
    input.tenantId,
    input.branded,
  );
  const s = StyleSheet.create({
    page: { padding: 32, fontSize: 9.5, color: palette.tinta, fontFamily: 'Helvetica' },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
    },
    title: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: t.heading },
    muted: { color: palette.grafite },
    routine: { marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: t.panel },
    h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 6, color: t.heading },
    row: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: t.rule,
      paddingVertical: 4,
    },
    name: { width: '42%', fontFamily: 'Helvetica-Bold' },
    col: { width: '14.5%' },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 32,
      right: 32,
      color: palette.grafite,
      fontSize: 8,
      textAlign: 'center',
    },
  });
  const setsText = (sets: { type: string; reps: string | null }[]) => {
    const work = sets.filter((x) => x.type === 'WORK');
    const reps = [...new Set(work.map((x) => x.reps ?? '–'))].join(' / ');
    return `${work.length} × ${reps}`;
  };
  const load = (sets: { targetLoadKg: unknown }[]) => {
    const v = sets
      .map((x) => (x.targetLoadKg === null ? null : Number(x.targetLoadKg)))
      .filter((x): x is number => x !== null);
    return v.length ? `${[...new Set(v)].join(' / ')} kg` : '–';
  };
  const rest = (sets: { restSeconds: number | null }[]) => {
    const r = sets.find((x) => x.restSeconds)?.restSeconds;
    return r ? `${r}s` : '–';
  };
  const brand = input.branded ? p.tenant.name : 'vetta';

  const doc: ReactElement = h(
    Document,
    {
      title: `${p.name}${p.studentLink ? ` — ${p.studentLink.displayName}` : ''}`,
      author: input.branded ? p.tenant.name : 'Vetta',
    },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(
        View,
        { style: s.header },
        logo
          ? h(Image, { src: logo, style: { height: 30, maxWidth: 130, objectFit: 'contain' } })
          : h(
              View,
              { style: { flexDirection: 'row', alignItems: 'center' } },
              h(
                Svg,
                { width: 20, height: 20, viewBox: '0 0 48 48' },
                h(Polyline, {
                  points: '7,16 19,36 41,9',
                  stroke: t.accent,
                  strokeWidth: 7.5,
                  fill: 'none',
                }),
              ),
              h(
                Text,
                { style: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginLeft: 6 } },
                brand,
              ),
            ),
        h(
          Text,
          { style: s.muted },
          new Date().toLocaleDateString('pt-BR', { timeZone: p.tenant.timezone }),
        ),
      ),
      h(Text, { style: s.title }, p.name),
      h(
        Text,
        { style: s.muted },
        [p.studentLink?.displayName, p.goal].filter(Boolean).join(' · ') || ' ',
      ),
      ...p.routines.map((r) =>
        h(
          View,
          { style: s.routine, key: r.id, wrap: false },
          h(Text, { style: s.h2 }, `Treino ${r.label}${r.name ? ` – ${r.name}` : ''}`),
          h(
            View,
            { style: s.row },
            h(Text, { style: s.name }, 'Exercício'),
            h(Text, { style: s.col }, 'Séries × reps'),
            h(Text, { style: s.col }, 'Carga'),
            h(Text, { style: s.col }, 'Descanso'),
            h(Text, { style: s.col }, 'Método'),
          ),
          ...r.exercises.map((e) =>
            h(
              View,
              { style: s.row, key: e.id },
              h(Text, { style: s.name }, e.exercise.name),
              h(Text, { style: s.col }, setsText(e.sets)),
              h(Text, { style: s.col }, load(e.sets)),
              h(Text, { style: s.col }, rest(e.sets)),
              h(Text, { style: s.col }, METHOD_LABEL[e.method] ?? ''),
            ),
          ),
          r.notes ? h(Text, { style: { ...s.muted, marginTop: 6 } }, r.notes) : null,
        ),
      ),
      h(
        Text,
        { style: s.footer, fixed: true },
        `${input.branded ? p.tenant.name : 'Vetta'} · Seu método. Seu aluno. Sua evolução.`,
      ),
    ),
  );
  return renderToBuffer(doc as never);
}
