import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Overview as OverviewData } from '../api/types.js';
import { CategoryChart } from '../components/CategoryChart.js';
import { MonthlyChart } from '../components/MonthlyChart.js';
import { money, monthRange } from '../format.js';
import { MOBILE, useMediaQuery } from '../useMediaQuery.js';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function Overview(): ReactNode {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useMediaQuery(MOBILE);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const range = monthRange(year, month);
    api
      .overview({ ...range, year })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [year, month]);

  const balancePositive = (data?.balanceCents ?? 0) >= 0;

  return (
    <>
      <h1 className="page-title">Visão geral</h1>
      <p className="page-subtitle">
        Receitas, despesas e saldo do período. Transferências entre suas contas — como o pagamento
        da fatura — ficam de fora dos totais.
      </p>

      <div className="filters filters--compact">
        <div className="field">
          <label htmlFor="mes">Mês</label>
          <select id="mes" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ano">Ano</label>
          <select id="ano" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => today.getFullYear() - i).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="kpi-row">
        <div className="card">
          <p className="kpi-label">
            <i className="swatch" style={{ background: 'var(--series-income)' }} /> Receitas
          </p>
          <div className="kpi-value">
            {loading ? (
              <span className="skeleton" style={{ display: 'block', width: 120 }} />
            ) : (
              money(data?.incomeCents ?? 0)
            )}
          </div>
        </div>

        <div className="card">
          <p className="kpi-label">
            <i className="swatch" style={{ background: 'var(--series-expense)' }} /> Despesas
          </p>
          <div className="kpi-value">
            {loading ? (
              <span className="skeleton" style={{ display: 'block', width: 120 }} />
            ) : (
              money(data?.expenseCents ?? 0)
            )}
          </div>
        </div>

        <div className="card">
          <p className="kpi-label">Saldo do mês</p>
          <div
            className="kpi-value"
            style={{ color: balancePositive ? undefined : 'var(--danger)' }}
          >
            {loading ? (
              <span className="skeleton" style={{ display: 'block', width: 120 }} />
            ) : (
              money(data?.balanceCents ?? 0)
            )}
          </div>
          <p className="kpi-hint">
            {balancePositive ? 'Receitas maiores que despesas' : 'Despesas maiores que receitas'}
          </p>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          {/* Doze meses em 330px deixam os rótulos ilegíveis: no celular
              mostramos os seis últimos, que é a janela que interessa. */}
          <MonthlyChart data={data?.monthly ?? []} year={year} months={isMobile ? 6 : 12} />
        </div>

        <div className="card">
          <h2 className="card-title">Despesas por categoria · {MONTHS[month - 1]}</h2>
          {loading ? (
            <div className="stack">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          ) : (
            <CategoryChart data={data?.expensesByCategory ?? []} />
          )}
        </div>
      </div>
    </>
  );
}
