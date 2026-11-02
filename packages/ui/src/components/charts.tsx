'use client';

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { cn } from '../utils.js';

export interface Point {
  /** Data ISO ou rótulo da categoria. */
  x: string;
  y: number;
}

interface BaseProps {
  title: string;
  data: Point[];
  unit?: string;
  formatX?: (x: string) => string;
  height?: number;
  className?: string;
  emptyText?: string;
}

const W = 640;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const step = 10 ** Math.floor(Math.log10((max - min) / count));
  const err = (max - min) / count / step;
  const s = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const out: number[] = [];
  for (let v = Math.floor(min / s) * s; v <= max + s / 2; v += s)
    out.push(Math.round(v * 100) / 100);
  return out;
}

const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const defaultX = (x: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(x)
    ? new Date(x).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
    : x;

/** Moldura comum: título, alternância gráfico/tabela e estado vazio. */
function Frame({
  title,
  data,
  unit,
  formatX,
  className,
  emptyText,
  children,
}: BaseProps & { children: React.ReactNode }) {
  const [table, setTable] = useState(false);
  const fx = formatX ?? defaultX;
  return (
    <figure
      className={cn(
        'flex flex-col gap-2 rounded-card border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <figcaption className="font-semibold">{title}</figcaption>
        {data.length ? (
          <button
            type="button"
            className="min-h-11 rounded-control px-3 text-sm text-link hover:underline"
            onClick={() => setTable((v) => !v)}
          >
            {table ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        ) : null}
      </div>
      {!data.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {emptyText ?? 'Sem dados ainda.'}
        </p>
      ) : table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Data</th>
              <th className="py-1 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1">{fx(d.x)}</td>
                <td className="py-1 text-right tabular-nums">
                  {fmtNum(d.y)}
                  {unit ? ` ${unit}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </figure>
  );
}

function useScales(data: Point[], height: number, zeroBased: boolean) {
  return useMemo(() => {
    const ys = data.map((d) => d.y);
    const lo = zeroBased ? 0 : Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = zeroBased ? 0 : (hi - lo || Math.abs(hi) || 1) * 0.1;
    const ticks = niceTicks(lo - pad, hi + pad);
    const min = Math.min(ticks[0]!, lo);
    const max = Math.max(ticks.at(-1)!, hi);
    const ih = height - PAD.top - PAD.bottom;
    const iw = W - PAD.left - PAD.right;
    const y = (v: number) => PAD.top + ih - ((v - min) / (max - min || 1)) * ih;
    return { ticks, y, iw, ih };
  }, [data, height, zeroBased]);
}

/** Linha de série única (peso, % gordura, carga). Crosshair + tooltip no hover e no teclado. */
export function LineChart(props: BaseProps) {
  const { data, unit, height = 220 } = props;
  const fx = props.formatX ?? defaultX;
  const { ticks, y, iw } = useScales(data, height, false);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const x = (i: number) => PAD.left + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.y)}`).join(' ');
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? data.length) - 1));
  };
  const a = active !== null ? data[active] : null;
  return (
    <Frame {...props}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full"
          role="img"
          aria-labelledby={`${id}-desc`}
          tabIndex={0}
          onKeyDown={onKey}
          onMouseLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <desc id={`${id}-desc`}>
            {`${props.title}: ${data.length} pontos, de ${fmtNum(data[0]!.y)} a ${fmtNum(data.at(-1)!.y)}${unit ? ` ${unit}` : ''}.`}
          </desc>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i === 0 || i === data.length - 1 || data.length <= 6 ? (
              <text
                key={i}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {fx(d.x)}
              </text>
            ) : null,
          )}
          {a ? (
            <line
              x1={x(active!)}
              x2={x(active!)}
              y1={PAD.top}
              y2={height - PAD.bottom}
              className="stroke-muted-foreground"
              strokeDasharray="3 3"
            />
          ) : null}
          <path
            d={path}
            fill="none"
            className="stroke-chart"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.y)}
              r={i === active ? 5 : 4}
              className="fill-chart stroke-surface"
              strokeWidth={2}
            />
          ))}
          {/* alvos de hover maiores que as marcas */}
          {data.map((_, i) => (
            <rect
              key={`h${i}`}
              x={x(i) - iw / Math.max(1, data.length - 1) / 2}
              y={0}
              width={Math.max(24, iw / Math.max(1, data.length - 1))}
              height={height}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          ))}
        </svg>
        {a ? (
          <div
            className="pointer-events-none absolute top-0 rounded-control border border-border bg-surface px-2 py-1 text-sm shadow"
            style={{ left: `${(x(active!) / W) * 100}%`, transform: 'translateX(-50%)' }}
            role="status"
          >
            <span className="text-muted-foreground">{fx(a.x)}: </span>
            <span className="font-semibold tabular-nums">
              {fmtNum(a.y)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

/** Barras ancoradas na base (volume semanal). Ponta superior arredondada (4px) e 2px de respiro entre barras. */
export function BarChart(props: BaseProps) {
  const { data, unit, height = 220 } = props;
  const fx = props.formatX ?? defaultX;
  const { ticks, y, iw } = useScales(data, height, true);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  const slot = iw / data.length;
  const bw = Math.max(4, Math.min(40, slot - 2));
  const base = y(0);
  const a = active !== null ? data[active] : null;
  return (
    <Frame {...props}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="w-full"
          role="img"
          aria-labelledby={`${id}-d`}
          onMouseLeave={() => setActive(null)}
        >
          <desc id={`${id}-d`}>{`${props.title}: ${data.length} barras.`}</desc>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const top = y(d.y);
            const h = Math.max(0, base - top);
            const r = Math.min(4, h, bw / 2);
            const path = `M${cx - bw / 2},${base} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${base} Z`;
            return (
              <g key={i} onMouseEnter={() => setActive(i)}>
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={height - PAD.top - PAD.bottom}
                  fill="transparent"
                />
                {h > 0 ? (
                  <path
                    d={path}
                    className={cn('fill-chart', active !== null && active !== i && 'opacity-60')}
                  />
                ) : null}
                {i === 0 || i === data.length - 1 || data.length <= 8 ? (
                  <text
                    x={cx}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {fx(d.x)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {a ? (
          <div
            className="pointer-events-none absolute top-0 rounded-control border border-border bg-surface px-2 py-1 text-sm shadow"
            style={{
              left: `${((PAD.left + slot * active! + slot / 2) / W) * 100}%`,
              transform: 'translateX(-50%)',
            }}
            role="status"
          >
            <span className="text-muted-foreground">{fx(a.x)}: </span>
            <span className="font-semibold tabular-nums">
              {fmtNum(a.y)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

/** Número de destaque (stat tile): quando um único valor conta a história. */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-card border border-border bg-surface p-4',
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-display text-2xl tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
