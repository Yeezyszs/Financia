import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Drill, Overview as OverviewData, Snapshot } from '../api/types.js';
import { CategoryChart } from '../components/CategoryChart.js';
import { MonthlyChart } from '../components/MonthlyChart.js';
import { RecurringCard } from '../components/RecurringCard.js';
import { TrendList } from '../components/TrendList.js';
import { ExportSummary } from '../components/ExportSummary.js';
import { money, monthRange, monthsBefore } from '../format.js';
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

export function Overview({ onDrill }: { onDrill: (drill: Drill) => void }): ReactNode {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<OverviewData | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [janela, setJanela] = useState(6);
  const [erroSnapshot, setErroSnapshot] = useState<string | null>(null);
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

  // O retrato analítico é uma chamada separada de propósito: ele varre
  // seis meses e não deve segurar a renderização dos totais do mês.
  useEffect(() => {
    let active = true;
    const referencia = `${year}-${String(month).padStart(2, '0')}`;

    setErroSnapshot(null);

    api
      .snapshot({ month: referencia, months: janela })
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((err: Error) => {
        // A análise é complementar — a Visão Geral continua de pé sem
        // ela. Mas falhar em silêncio deixava esqueleto de carregamento
        // para sempre, sem dizer que havia um erro.
        if (!active) return;
        setSnapshot(null);
        setErroSnapshot(err.message);
      });

    return () => {
      active = false;
    };
  }, [year, month, janela]);

  const balancePositive = (data?.balanceCents ?? 0) >= 0;

  // Quanto da renda sobrou. É o número que muda comportamento — "sobrou
  // R$ 4 mil" não diz se foi um mês bom sem a renda ao lado.
  const receita = data?.incomeCents ?? 0;
  const taxaPoupanca = receita > 0 ? Math.round(((data?.balanceCents ?? 0) / receita) * 100) : null;

  const doMes = monthRange(year, month);
  const daJanela = { from: monthsBefore(year, month, janela - 1), to: doMes.to };

  /** Recorte do mês: cards de topo e despesas por categoria. */
  const drillDoMes = (parcial: Omit<Drill, 'from' | 'to'>) => onDrill({ ...parcial, ...doMes });

  /** Recorte da janela de análise: recorrentes e variações. */
  const drillDaJanela = (parcial: Omit<Drill, 'from' | 'to'>) =>
    onDrill({ ...parcial, ...daJanela });

  return (
    <>
      <h1 className="page-title">Visão geral</h1>
      <p className="page-subtitle">
        Receitas, despesas e saldo do período. Transferências entre suas contas — como o pagamento
        da fatura — ficam de fora dos totais.
      </p>

      {/* Só o mês fica aqui em cima, porque é o único controle que
          governa a página toda. Ano e janela de análise moram no
          cabeçalho do card que cada um controla — juntos os três
          pareciam governar tudo, e nenhum governava. */}
      <div className="filters filters--compact">
        <div className="field">
          <label htmlFor="mes">Mês de referência</label>
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
            {taxaPoupanca === null
              ? balancePositive
                ? 'Receitas maiores que despesas'
                : 'Despesas maiores que receitas'
              : `${taxaPoupanca}% da renda do mês`}
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
            <CategoryChart data={data?.expensesByCategory ?? []} onDrill={drillDoMes} />
          )}
        </div>
      </div>

      <div className="chart-grid" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Gastos recorrentes</h2>
            {/* O controle mora aqui porque é só isto que ele governa —
                este card, o de variações e o resumo exportado. */}
            <select
              className="card-control"
              value={janela}
              onChange={(e) => setJanela(Number(e.target.value))}
              aria-label="Janela da análise de recorrência"
            >
              <option value={3}>últimos 3 meses</option>
              <option value={6}>últimos 6 meses</option>
              <option value={12}>últimos 12 meses</option>
              <option value={24}>últimos 24 meses</option>
            </select>
          </div>
          {erroSnapshot ? (
            <div className="notice error">{erroSnapshot}</div>
          ) : snapshot ? (
            <RecurringCard snapshot={snapshot} onDrill={drillDaJanela} />
          ) : (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">
            {MONTHS[month - 1]} comparado à média dos últimos {janela} meses
          </h2>
          {erroSnapshot ? (
            <div className="notice error">{erroSnapshot}</div>
          ) : snapshot ? (
            <TrendList trends={snapshot.trends} onDrill={drillDoMes} />
          ) : (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 className="card-title">Analisar com o Claude</h2>
        <p className="page-subtitle" style={{ marginBottom: 14 }}>
          Gera um resumo dos últimos {janela} meses — totais, assinaturas, recorrentes e variações —
          já com o contexto necessário para uma conversa sobre onde economizar.
        </p>
        <ExportSummary month={`${year}-${String(month).padStart(2, '0')}`} months={janela} />
      </div>
    </>
  );
}
