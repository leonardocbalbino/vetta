import { palette } from '@vetta/tokens';
import { createElement as h } from 'react';

/** Exportações (CSV e PDF) de tabelas: alunos, treinos, cargas e financeiro. */

export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number | null)[][];
}

const cellCsv = (v: string | number | null) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v).replace('.', ',');
  // Fórmulas no Excel (=, +, -, @) viram texto.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[";\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** CSV com ";" e BOM (abre com acentos no Excel em pt-BR). */
export function tableToCsv(t: ExportTable): string {
  const lines = [t.columns, ...t.rows].map((r) => r.map(cellCsv).join(';'));
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`;
}

/** PDF paisagem com cabeçalho (nome do personal) e rodapé discreto "feito com Vetta". */
export async function tableToPdf(t: ExportTable, brandName: string): Promise<Buffer> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } =
    await import('@react-pdf/renderer');
  const s = StyleSheet.create({
    page: { padding: 28, fontSize: 8, color: palette.tinta, fontFamily: 'Helvetica' },
    title: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
    subtitle: { fontSize: 9, color: palette.grafite, marginTop: 2, marginBottom: 12 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: palette.linha },
    head: { backgroundColor: palette.nevoa, fontFamily: 'Helvetica-Bold' },
    cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 3 },
    footer: {
      position: 'absolute',
      bottom: 16,
      left: 28,
      right: 28,
      fontSize: 7,
      color: palette.grafite,
    },
  });
  const row = (cells: (string | number | null)[], head = false, key?: number) =>
    h(
      View,
      { style: head ? [s.row, s.head] : s.row, key, wrap: false },
      ...cells.map((c, i) => h(Text, { style: s.cell, key: i }, c === null ? '' : String(c))),
    );
  const doc = h(
    Document,
    { title: t.title },
    h(
      Page,
      { size: 'A4', orientation: 'landscape', style: s.page },
      h(Text, { style: s.title }, `${brandName} · ${t.title}`),
      t.subtitle ? h(Text, { style: s.subtitle }, t.subtitle) : null,
      row(t.columns, true),
      ...t.rows.slice(0, 5000).map((r, i) => row(r, false, i)),
      h(Text, {
        style: s.footer,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `feito com Vetta · página ${pageNumber} de ${totalPages}`,
      }),
    ),
  );
  return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
