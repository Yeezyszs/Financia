import { useState, type ReactNode } from 'react';
import type { MonthlyTotal } from '../api/types.js';
import { money, moneyShort, monthLabel, monthLabelLong } from '../format.js';
import { Tooltip, type TooltipState } from './Tooltip.js';

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 12, right: 8, bottom: 26, left: 54 };
const BAR_RADIUS = 4;
const BAR_GAP = 2; // respiro entre as duas barras do mesmo mês

/** Barra com o topo arredondado e a base reta, ancorada na linha zero. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(BAR_RADIUS, width / 2, Math.max(height, 0));
  if (height <= 0) return '';
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
}

/** Escala "bonita": teto arredondado para cima e 4 faixas de grade. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 100, ticks: [0, 50, 100] };
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / (magnitude / 2)) * (magnitude / 2);
  const step = top / 4;
  return { top, ticks: [0, step, step * 2, step * 3, top] };
}

export function MonthlyChart({ data, year }: { data: MonthlyTotal[]; year: number }): ReactNode {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // O gráfico mostra os 12 meses do ano, mesmo os sem movimento: buraco
  // no meio da série é informação, não motivo para encolher o eixo.
  const byMonth = new Map(data.map((row) => [row.month, row]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`;
    return byMonth.get(key) ?? { month: key, incomeCents: 0, expenseCents: 0 };
  });

  const max = Math.max(...months.flatMap((m) => [m.incomeCents, m.expenseCents]), 0);
  const { top, ticks } = niceScale(max);

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slotWidth = plotWidth / 12;
  const barWidth = Math.max((slotWidth - BAR_GAP) / 2 - 5, 3);
  const toY = (cents: number) => PAD.top + plotHeight - (cents / top) * plotHeight;

  const hasMovement = months.some((m) => m.incomeCents > 0 || m.expenseCents > 0);

  return (
    <div>
      <div className="chart-header">
        <h2 className="card-title" style={{ margin: 0 }}>
          Evolução mensal · {year}
        </h2>
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: 'var(--series-income)' }} /> Receitas
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--series-expense)' }} /> Despesas
          </span>
        </div>
      </div>

      {hasMovement ? (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Receitas e despesas por mês em ${year}`}
          onMouseLeave={() => setTooltip(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="grid-line"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={toY(tick)}
                y2={toY(tick)}
              />
              <text className="axis-label" x={PAD.left - 8} y={toY(tick) + 4} textAnchor="end">
                {tick === 0 ? '0' : moneyShort(tick)}
              </text>
            </g>
          ))}

          {months.map((month, index) => {
            const slotX = PAD.left + index * slotWidth;
            const incomeX = slotX + slotWidth / 2 - barWidth - BAR_GAP / 2;
            const expenseX = slotX + slotWidth / 2 + BAR_GAP / 2;
            const incomeY = toY(month.incomeCents);
            const expenseY = toY(month.expenseCents);
            const baseline = toY(0);

            const show = (event: { clientX: number; clientY: number }) =>
              setTooltip({
                x: event.clientX,
                y: event.clientY,
                title: monthLabelLong(month.month),
                rows: [
                  {
                    label: 'Receitas',
                    value: money(month.incomeCents),
                    color: 'var(--series-income)',
                  },
                  {
                    label: 'Despesas',
                    value: money(month.expenseCents),
                    color: 'var(--series-expense)',
                  },
                  { label: 'Saldo', value: money(month.incomeCents - month.expenseCents) },
                ],
              });

            return (
              <g key={month.month}>
                <path
                  d={barPath(incomeX, incomeY, barWidth, baseline - incomeY)}
                  fill="var(--series-income)"
                />
                <path
                  d={barPath(expenseX, expenseY, barWidth, baseline - expenseY)}
                  fill="var(--series-expense)"
                />
                {/* alvo de hover do mês inteiro: maior que as barras, de propósito */}
                <rect
                  className="hit"
                  x={slotX}
                  y={PAD.top}
                  width={slotWidth}
                  height={plotHeight}
                  onMouseMove={show}
                  onMouseEnter={show}
                />
                <text
                  className="axis-label"
                  x={slotX + slotWidth / 2}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                >
                  {monthLabel(month.month)}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="empty">Sem movimento em {year}. Importe um extrato para ver a evolução.</div>
      )}

      <Tooltip state={tooltip} />
    </div>
  );
}
