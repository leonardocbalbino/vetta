import { contrastRatio, palette } from '@vetta/tokens';
import { describe, expect, it } from 'vitest';
import { pdfTheme } from './brand';
import { renderWorkoutPdf } from './workout-pdf';

describe('cores do PDF (white label)', () => {
  it('sem cor da marca usa a paleta da Vetta', () => {
    expect(pdfTheme(null)).toEqual({
      heading: palette.tinta,
      accent: palette.tinta,
      panel: palette.nevoa,
      rule: palette.linha,
    });
    expect(pdfTheme({ primaryColor: 'roxo' }).heading).toBe(palette.tinta);
  });

  it('cor escura vai como está nos títulos; fundos ficam num tom claro dela', () => {
    const t = pdfTheme({ primaryColor: '#7A1FA2' });
    expect(t.heading).toBe('#7A1FA2');
    expect(t.accent).toBe('#7A1FA2');
    expect(contrastRatio(t.panel, '#FFFFFF')).toBeLessThan(1.2);
  });

  it('cor clara é escurecida só o necessário para ler no papel', () => {
    const t = pdfTheme({ primaryColor: '#C6F432' });
    expect(contrastRatio(t.heading, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.accent, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(t.heading).not.toBe(palette.tinta);
  });

  it('gera o PDF de treino com a marca do personal', async () => {
    const db = {
      workoutProgram: {
        findUniqueOrThrow: () =>
          Promise.resolve({
            name: 'Hipertrofia A/B',
            goal: 'Hipertrofia',
            tenant: { name: 'Studio Roxo', timezone: 'America/Sao_Paulo' },
            studentLink: { displayName: 'Ana' },
            routines: [
              {
                id: 'r1',
                label: 'A',
                name: 'Inferiores',
                notes: null,
                exercises: [
                  {
                    id: 'e1',
                    method: 'STANDARD',
                    exercise: { name: 'Agachamento livre' },
                    sets: [{ type: 'WORK', reps: '10', targetLoadKg: 40, restSeconds: 90 }],
                  },
                ],
              },
            ],
          }),
      },
      tenantBrand: {
        findUnique: () => Promise.resolve({ primaryColor: '#7A1FA2', logoMediaId: null }),
      },
    };
    const pdf = await renderWorkoutPdf(
      { db: db as never, storage: {} as never },
      { programId: 'p', tenantId: 't', branded: true },
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // O primeiro carregamento do react-pdf é lento.
  }, 30_000);
});
