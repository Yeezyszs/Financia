import type { ReactNode } from 'react';
import type { CategoryTrend, Drill } from '../api/types.js';
import { money } from '../format.js';

/** Só vale falar de variação com movimento dos dois lados. */
const MINIMO_RELEVANTE = 10;

export function TrendList({
  trends,
  canCompare = true,
  onDrill,
}: {
  trends: CategoryTrend[];
  /** Falso numa janela de um mês: a média seria o próprio mês. */
  canCompare?: boolean;
  onDrill?: (drill: Omit<Drill, 'from' | 'to' | 'origem'>) => void;
}): ReactNode {
  // "Nada variou" e "não dá para comparar" são coisas diferentes, e a
  // segunda dita disfarçada de primeira faz a pessoa concluir que o mês
  // foi igual aos outros — quando não há outros na janela.
  if (!canCompare) {
    return (
      <div className="empty">
        Comparar exige pelo menos dois meses na janela. Aumente o período em “Gastos recorrentes”
        para ver o que mudou.
      </div>
    );
  }

  const relevantes = trends
    .filter((t) => t.currentCents > 0 && Math.abs(t.changePercent) >= MINIMO_RELEVANTE)
    .slice(0, 6);

  if (relevantes.length === 0) {
    return <div className="empty">Nenhuma categoria variou de forma relevante no período.</div>;
  }

  return (
    <div>
      {relevantes.map((trend) => (
        <div className="rec-row" key={trend.categoryId ?? trend.name}>
          {onDrill ? (
            <button
              className="link acao rec-label"
              onClick={() =>
                onDrill(
                  trend.categoryId
                    ? { rotulo: trend.name, categoryIds: [trend.categoryId] }
                    : { rotulo: 'Sem categoria', onlyUncategorized: true },
                )
              }
            >
              {trend.name}
            </button>
          ) : (
            <span className="rec-label">{trend.name}</span>
          )}
          <span className={trend.changePercent > 0 ? 'delta delta-up' : 'delta delta-down'}>
            {trend.changePercent > 0 ? '+' : ''}
            {trend.changePercent}%
          </span>
          <span className="rec-meta">
            {money(trend.currentCents)} neste mês · média de {money(trend.averageCents)}
          </span>
        </div>
      ))}
    </div>
  );
}
