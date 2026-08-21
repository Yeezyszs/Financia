import type { ReactNode } from 'react';
import type { CategoryBreakdown } from '../api/types.js';
import { money } from '../format.js';

const MAX_ROWS = 8;

/**
 * Despesas por categoria: barras horizontais ordenadas, hue única.
 *
 * A identidade aqui é carregada pelo rótulo, não pela cor — o trabalho do
 * gráfico é comparar magnitude. Uma cor por categoria só criaria oito
 * hues indistinguíveis sob daltonismo sem informar nada a mais. Da nona
 * categoria em diante a cauda vira "Outras".
 */
export function CategoryChart({ data }: { data: CategoryBreakdown[] }): ReactNode {
  if (data.length === 0) {
    return <div className="empty">Nenhuma despesa no período.</div>;
  }

  const visible = data.slice(0, MAX_ROWS);
  const tail = data.slice(MAX_ROWS);

  const rows = [...visible];
  if (tail.length > 0) {
    rows.push({
      categoryId: null,
      name: `Outras (${tail.length})`,
      color: null,
      totalCents: tail.reduce((sum, row) => sum + row.totalCents, 0),
      count: tail.reduce((sum, row) => sum + row.count, 0),
    });
  }

  const max = Math.max(...rows.map((row) => row.totalCents));
  const total = data.reduce((sum, row) => sum + row.totalCents, 0);

  return (
    <div>
      {rows.map((row) => {
        const share = total > 0 ? Math.round((row.totalCents / total) * 100) : 0;
        return (
          <div className="cat-row" key={row.categoryId ?? row.name}>
            <span>{row.name}</span>
            <span className="cat-value">
              {money(row.totalCents)} · {share}%
            </span>
            <span className="cat-bar-track">
              <span
                className="cat-bar-fill"
                style={{ width: `${Math.max((row.totalCents / max) * 100, 1.5)}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
