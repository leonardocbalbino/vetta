import type { PrismaClient } from '@vetta/db';
import { palette } from '@vetta/tokens';
import { createElement as h, type ReactElement } from 'react';
import { buildStorageKey, type StorageProvider } from '../storage/storage';

const BMI_LABEL: Record<string, string> = {
  underweight: 'Abaixo do peso',
  normal: 'Normal',
  overweight: 'Sobrepeso',
  obesity_1: 'Obesidade grau I',
  obesity_2: 'Obesidade grau II',
  obesity_3: 'Obesidade grau III',
};
const FAT_LABEL: Record<string, string> = {
  essential: 'Gordura essencial',
  athlete: 'Atleta',
  fitness: 'Em forma',
  average: 'Média',
  obese: 'Acima da média',
};
const RISK_LABEL: Record<string, string> = { low: 'Baixo', moderate: 'Moderado', high: 'Alto' };

export interface AssessmentPdfDeps {
  db: PrismaClient;
  storage: StorageProvider;
}

/**
 * Gera o PDF da avaliação física (react-pdf) e salva como documento do aluno.
 * Com a feature assessment.pdf_branding o cabeçalho leva o nome do personal.
 */
export async function generateAssessmentPdf(
  deps: AssessmentPdfDeps,
  job: { assessmentId: string; tenantId: string; branded: boolean },
) {
  // react-pdf é ESM: import dinâmico a partir do worker (CommonJS).
  const { Document, Page, Text, View, StyleSheet, renderToBuffer, Svg, Polyline } =
    await import('@react-pdf/renderer');
  const a = await deps.db.physicalAssessment.findUniqueOrThrow({
    where: { id: job.assessmentId },
    include: { studentLink: true, tenant: true },
  });
  const r = (a.results ?? {}) as Record<string, number | string | undefined>;
  const perimeters = (a.perimeters ?? {}) as Record<string, number>;
  const skinfolds = (a.skinfolds ?? {}) as Record<string, number>;
  const s = StyleSheet.create({
    page: { padding: 36, fontSize: 10, color: palette.tinta, fontFamily: 'Helvetica' },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
    },
    brand: { flexDirection: 'row', alignItems: 'center' },
    title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
    muted: { color: palette.grafite },
    section: { marginTop: 14 },
    h2: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    card: {
      width: '31%',
      marginRight: '2%',
      marginBottom: 8,
      padding: 8,
      borderRadius: 8,
      backgroundColor: palette.nevoa,
    },
    big: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: palette.linha,
      paddingVertical: 3,
    },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 36,
      right: 36,
      fontSize: 8,
      color: palette.grafite,
    },
  });
  const card = (label: string, value: string, hint?: string) =>
    h(
      View,
      { style: s.card },
      h(Text, { style: s.muted }, label),
      h(Text, { style: s.big }, value),
      hint ? h(Text, { style: s.muted }, hint) : null,
    );
  const fmt = (v: number | string | undefined, unit = '') =>
    v === undefined || v === null ? '—' : `${String(v).replace('.', ',')}${unit}`;
  const table = (title: string, rows: Record<string, number>, unit: string) =>
    Object.keys(rows).length
      ? h(
          View,
          { style: s.section },
          h(Text, { style: s.h2 }, title),
          ...Object.entries(rows).map(([k, v]) =>
            h(View, { style: s.row, key: k }, h(Text, null, k), h(Text, null, fmt(v, unit))),
          ),
        )
      : null;

  const brandName = job.branded ? a.tenant.name : 'Vetta';
  const doc: ReactElement = h(
    Document,
    { title: `Avaliação física — ${a.studentLink.displayName}`, author: brandName },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(
        View,
        { style: s.header },
        h(
          View,
          { style: s.brand },
          h(
            Svg,
            { width: 22, height: 22, viewBox: '0 0 48 48' },
            h(Polyline, {
              points: '7,16 19,36 41,9',
              stroke: palette.tinta,
              strokeWidth: 7.5,
              fill: 'none',
            }),
          ),
          h(
            Text,
            { style: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginLeft: 6 } },
            job.branded ? a.tenant.name : 'vetta',
          ),
        ),
        h(
          Text,
          { style: s.muted },
          a.assessedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        ),
      ),
      h(Text, { style: s.title }, 'Avaliação física'),
      h(
        Text,
        { style: s.muted },
        `${a.studentLink.displayName} · protocolo ${a.protocol.replace(/_/g, ' ')}`,
      ),
      h(
        View,
        { style: [s.section, s.grid] },
        card('Peso', fmt(a.weightKg ? Number(a.weightKg) : undefined, ' kg')),
        card('Altura', fmt(a.heightCm ? Number(a.heightCm) : undefined, ' cm')),
        card('IMC', fmt(r.bmi), BMI_LABEL[String(r.bmiClass)]),
        card('% de gordura', fmt(r.bodyFatPct, '%'), FAT_LABEL[String(r.bodyFatClass)]),
        card('Massa magra', fmt(r.leanMassKg, ' kg')),
        card('Massa gorda', fmt(r.fatMassKg, ' kg')),
        card(
          'Relação cintura-quadril',
          fmt(r.waistHipRatio),
          r.waistHipRisk ? `Risco ${RISK_LABEL[String(r.waistHipRisk)]?.toLowerCase()}` : undefined,
        ),
      ),
      table('Dobras cutâneas', skinfolds, ' mm'),
      table('Perimetria', perimeters, ' cm'),
      a.notes
        ? h(
            View,
            { style: s.section },
            h(Text, { style: s.h2 }, 'Observações'),
            h(Text, null, a.notes),
          )
        : null,
      h(
        Text,
        { style: s.footer, fixed: true },
        `Gerado por ${brandName} com a Vetta · vettafit.com.br`,
      ),
    ),
  );
  const buffer = await renderToBuffer(doc as never);

  const mediaId = crypto.randomUUID();
  const storageKey = buildStorageKey({
    tenantId: a.tenantId,
    purpose: 'document',
    mediaId,
    fileName: 'avaliacao.pdf',
  });
  await deps.storage.put(storageKey, buffer, 'application/pdf', buffer.length);
  await deps.db.media.create({
    data: {
      id: mediaId,
      tenantId: a.tenantId,
      studentLinkId: a.studentLinkId,
      purpose: 'document',
      status: 'READY',
      bucket: deps.storage.bucket,
      storageKey,
      fileName: `avaliacao-${a.assessedAt.toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      size: BigInt(buffer.length),
      uploadExpiresAt: new Date(),
      uploadedAt: new Date(),
      processedAt: new Date(),
    },
  });
  await deps.db.physicalAssessment.update({ where: { id: a.id }, data: { pdfMediaId: mediaId } });
  return { mediaId, size: buffer.length };
}
