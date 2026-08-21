import type { ReactNode } from 'react';
import type { Snapshot } from '../api/types.js';
import { money } from '../format.js';

/**
 * Assinaturas e gastos recorrentes.
 *
 * A separação entre os dois não é cosmética: assinatura tem valor
 * estável e dá para cancelar inteira; recorrente de valor variável
 * (mercado, delivery) só dá para reduzir. O conselho que cabe em cada
 * caso é diferente, então a tela também trata diferente.
 */
export function RecurringCard({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { subscriptions, recurring, fixedMonthlyCents, variableMonthlyCents } = snapshot;

  if (subscriptions.length === 0 && recurring.length === 0) {
    return (
      <div className="empty">
        Ainda não dá para identificar recorrência — são necessários pelo menos três meses de
        histórico do mesmo estabelecimento.
      </div>
    );
  }

  const total = fixedMonthlyCents + variableMonthlyCents;
  const fatiaFixa = total > 0 ? Math.round((fixedMonthlyCents / total) * 100) : 0;

  return (
    <div className="stack">
      <div className="split-bar" role="img" aria-label={`${fatiaFixa}% do gasto mensal é fixo`}>
        <span className="split-fixo" style={{ width: `${fatiaFixa}%` }} />
      </div>
      <div className="split-legend">
        <span>
          <b>{money(fixedMonthlyCents)}</b> fixo por mês · {fatiaFixa}%
        </span>
        <span>
          <b>{money(variableMonthlyCents)}</b> variável
        </span>
      </div>

      {subscriptions.length > 0 ? (
        <div>
          <h3 className="card-title">Assinaturas ({subscriptions.length})</h3>
          {subscriptions.slice(0, 6).map((item) => (
            <div className="rec-row" key={item.key}>
              <span className="rec-label">{item.label}</span>
              <span className="cat-value">{money(item.typicalCents)}/mês</span>
              <span className="rec-meta">
                {item.monthsSeen} meses · última em {item.lastSeen.slice(8, 10)}/
                {item.lastSeen.slice(5, 7)}
                {item.categoryName ? ` · ${item.categoryName}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {recurring.length > 0 ? (
        <div>
          <h3 className="card-title">Recorrentes de valor variável ({recurring.length})</h3>
          {recurring.slice(0, 5).map((item) => (
            <div className="rec-row" key={item.key}>
              <span className="rec-label">{item.label}</span>
              <span className="cat-value">{money(item.monthlyAverageCents)}/mês</span>
              <span className="rec-meta">
                {item.occurrences} compras em {item.monthsSeen} meses · normalmente{' '}
                {money(item.typicalCents)} por vez
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
