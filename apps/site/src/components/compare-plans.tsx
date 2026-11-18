import { FEATURE_CATALOG, UNLIMITED } from '@vetta/contracts';
import { PlanBadge } from '@vetta/ui';
import { Check, Minus } from 'lucide-react';
import { APP_URL, brl, type PublicPlan } from '@/lib/data';

/** Áreas da tabela, na ordem em que o personal pensa o trabalho. */
const SECTIONS: { title: string; modules: string[] }[] = [
  { title: 'Alunos e equipe', modules: ['M1', 'M2'] },
  { title: 'Avaliação e anamnese', modules: ['M3', 'M4'] },
  { title: 'Biblioteca e treinos', modules: ['M5', 'M6', 'M7'] },
  { title: 'Evolução', modules: ['M8'] },
  { title: 'Comunicação e agenda', modules: ['M9', 'M10'] },
  { title: 'Financeiro e relatórios', modules: ['M11'] },
  { title: 'Sua marca', modules: ['M12', 'M13'] },
  { title: 'Conteúdo e suporte', modules: ['M14', 'support'] },
];

/** Recursos internos que não fazem sentido na comparação. */
const HIDDEN = new Set(['core.auth', 'finance.split_fee_bps']);

function cell(key: string, type: string, v: number | boolean | undefined) {
  const no = <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Não incluído" />;
  if (type === 'BOOLEAN')
    return v === true ? (
      <Check className="mx-auto size-5 text-success" aria-label="Incluído" />
    ) : (
      no
    );
  if (typeof v !== 'number' || v === 0) return no;
  if (v === UNLIMITED) return <span className="font-semibold">Ilimitado</span>;
  if (key === 'storage.quota_mb')
    return <span className="font-semibold">{v >= 1024 ? `${v / 1024} GB` : `${v} MB`}</span>;
  return <span className="font-semibold tabular-nums">{v}</span>;
}

/** Comparação completa dos planos: todos os recursos do catálogo, por área. */
export function ComparePlans({ plans }: { plans: PublicPlan[] }) {
  const features = FEATURE_CATALOG.filter((f) => !HIDDEN.has(f.key));
  return (
    <section id="comparar" className="mt-20 scroll-mt-24">
      <h2 className="font-display mb-2 text-center text-2xl font-extrabold">Compare os planos</h2>
      <p className="mb-8 text-center text-muted-foreground">
        Todos os recursos, lado a lado. Você pode mudar de plano quando quiser.
      </p>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Recursos de cada plano do Vetta</caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              <th scope="col" className="w-2/5 p-4 text-left font-semibold">
                Recurso
              </th>
              {plans.map((p) => (
                <th key={p.code} scope="col" className="p-4 text-center align-bottom">
                  <div className="flex flex-col items-center gap-2">
                    <PlanBadge plan={p.code} />
                    <span className="font-display text-lg font-extrabold">
                      {p.prices.MONTHLY ? (
                        <>
                          {brl(p.prices.MONTHLY)}
                          <span className="text-xs font-normal text-muted-foreground">/mês</span>
                        </>
                      ) : (
                        'Grátis'
                      )}
                    </span>
                    <a
                      href={`${APP_URL}/cadastro?plano=${p.code.toLowerCase()}`}
                      className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {p.prices.MONTHLY ? 'Testar 14 dias' : 'Começar'}
                    </a>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          {SECTIONS.map((sec) => {
            const rows = features.filter((f) => sec.modules.includes(f.module));
            if (!rows.length) return null;
            return (
              <tbody key={sec.title}>
                <tr className="bg-muted">
                  <th
                    scope="colgroup"
                    colSpan={plans.length + 1}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {sec.title}
                  </th>
                </tr>
                {rows.map((f) => (
                  <tr key={f.key} className="border-b border-border last:border-0">
                    <th scope="row" className="p-4 text-left font-normal">
                      <span className="font-medium">{f.name}</span>
                      <span className="block text-xs text-muted-foreground">{f.description}</span>
                    </th>
                    {plans.map((p) => (
                      <td key={p.code} className="p-4 text-center">
                        {cell(f.key, f.type, p.features[f.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
