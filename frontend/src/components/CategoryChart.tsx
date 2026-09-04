import type { ReactNode } from 'react';
import type { CategoryBreakdown, Drill } from '../api/types.js';
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
export function CategoryChart({
  data,
  onDrill,
}: {
  data: CategoryBreakdown[];
  /** Abre as transações por trás da barra. A cauda "Outras" não abre. */
  onDrill?: (drill: Omit<Drill, 'from' | 'to'>) => void;
}): ReactNode {
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

  // A linha "Outras (n)" é um agregado de várias categorias: não existe
  // filtro que a reproduza, então ela não vira link.
  const agregado = (row: CategoryBreakdown) => row.name.startsWith('Outras (');

  return (
    <div>
      {rows.map((row) => {
        const share = total > 0 ? Math.round((row.totalCents / total) * 100) : 0;
        const abrir =
          onDrill && !agregado(row)
            ? () =>
                onDrill(
                  row.categoryId
                    ? { rotulo: row.name, categoryIds: [row.categoryId] }
                    : { rotulo: 'Sem categoria', onlyUncategorized: true },
                )
            : null;
        return (
          <div className="cat-row" key={row.categoryId ?? row.name}>
            {abrir ? (
              <button className="link acao" onClick={abrir}>
                {row.name}
              </button>
            ) : (
              <span>{row.name}</span>
            )}
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
