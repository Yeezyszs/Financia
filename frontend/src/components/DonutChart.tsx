import type { ReactNode } from 'react';
import type { CategoryBreakdown, Drill } from '../api/types.js';
import { money, moneyShort } from '../format.js';

/** Máximo de fatias antes da cauda virar "Outras". */
const MAX_FATIAS = 6;

/**
 * Ordem fixa de cores, tirada dos tokens da marca. Ela é ordinal, não
 * categórica: a maior fatia sempre pega a primeira cor, então a mesma
 * categoria pode mudar de cor entre meses. É de propósito — o que o
 * gráfico compara é tamanho, e a legenda ao lado, na mesma ordem, é
 * quem faz a ligação nome↔fatia sem depender de distinguir seis matizes.
 */
const CORES = [
  'var(--green)',
  'var(--teal)',
  'var(--gold)',
  'var(--indigo)',
  'var(--red)',
  'var(--text-3)',
];
const COR_CAUDA = 'var(--border-strong)';

const RAIO = 62;
const ESPESSURA = 22;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

export function DonutChart({
  data,
  onDrill,
}: {
  data: CategoryBreakdown[];
  onDrill?: (drill: Omit<Drill, 'from' | 'to' | 'origem'>) => void;
}): ReactNode {
  if (data.length === 0) {
    return <div className="empty">Nenhuma despesa no período.</div>;
  }

  const visiveis = data.slice(0, MAX_FATIAS);
  const cauda = data.slice(MAX_FATIAS);

  const fatias = visiveis.map((row, i) => ({
    ...row,
    cor: CORES[i] ?? COR_CAUDA,
    agregado: false,
  }));
  if (cauda.length > 0) {
    fatias.push({
      categoryId: null,
      name: `Outras (${cauda.length})`,
      color: null,
      totalCents: cauda.reduce((soma, row) => soma + row.totalCents, 0),
      count: cauda.reduce((soma, row) => soma + row.count, 0),
      cor: COR_CAUDA,
      agregado: true,
    });
  }

  const total = fatias.reduce((soma, f) => soma + f.totalCents, 0);
  if (total === 0) return <div className="empty">Nenhuma despesa no período.</div>;

  // `stroke-dasharray` desenha o arco e `stroke-dashoffset` o posiciona.
  // O acumulado vira o deslocamento da fatia seguinte.
  let acumulado = 0;

  return (
    <div className="donut-grid">
      <div className="chart-wrap">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`Despesas por categoria, total ${money(total)}`}
        >
          <g transform="rotate(-90 80 80)">
            {fatias.map((fatia) => {
              const parte = fatia.totalCents / total;
              const traco = parte * CIRCUNFERENCIA;
              const deslocamento = -acumulado * CIRCUNFERENCIA;
              acumulado += parte;

              return (
                <circle
                  key={fatia.categoryId ?? fatia.name}
                  cx="80"
                  cy="80"
                  r={RAIO}
                  fill="none"
                  stroke={fatia.cor}
                  strokeWidth={ESPESSURA}
                  // O 0.6 é uma folga: sem ela as fatias encostam e o
                  // anel parece um bloco único de cor.
                  strokeDasharray={`${Math.max(traco - 0.6, 0)} ${CIRCUNFERENCIA}`}
                  strokeDashoffset={deslocamento}
                />
              );
            })}
          </g>
          <text
            x="80"
            y="74"
            textAnchor="middle"
            fill="var(--text-3)"
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            total
          </text>
          <text
            x="80"
            y="92"
            textAnchor="middle"
            fill="var(--text)"
            style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-d)' }}
          >
            {moneyShort(total)}
          </text>
        </svg>
      </div>

      <div className="donut-legend">
        {fatias.map((fatia) => {
          const pct = Math.round((fatia.totalCents / total) * 100);
          const abrir =
            onDrill && !fatia.agregado
              ? () =>
                  onDrill(
                    fatia.categoryId
                      ? { rotulo: fatia.name, categoryIds: [fatia.categoryId] }
                      : { rotulo: 'Sem categoria', onlyUncategorized: true },
                  )
              : null;

          return (
            <div className="legend-item" key={fatia.categoryId ?? fatia.name}>
              <span className="legend-dot" style={{ background: fatia.cor }} aria-hidden="true" />
              {abrir ? (
                <button className="link legend-name" onClick={abrir}>
                  {fatia.name}
                </button>
              ) : (
                <span className="legend-name">{fatia.name}</span>
              )}
              <span className="legend-pct">{money(fatia.totalCents)}</span>
              <span className="legend-pct" style={{ color: 'var(--text-3)', minWidth: 34 }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
