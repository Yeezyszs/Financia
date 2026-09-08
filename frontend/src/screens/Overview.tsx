import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Drill, NetWorth, Overview as OverviewData, Snapshot } from '../api/types.js';
import { DonutChart } from '../components/DonutChart.js';
import { Kpi, type Variacao } from '../components/Kpi.js';
import { MonthlyChart } from '../components/MonthlyChart.js';
import { RecurringCard } from '../components/RecurringCard.js';
import { TrendList } from '../components/TrendList.js';
import { ExportSummary } from '../components/ExportSummary.js';
import { NetWorthCard } from '../components/NetWorthCard.js';
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
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
  // Muda quando um saldo é informado: é o que faz o patrimônio recarregar
  // sem arrastar junto o resto da página.
  const [versaoSaldo, setVersaoSaldo] = useState(0);
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

  useEffect(() => {
    let active = true;
    api
      .netWorth({ from: monthsBefore(year, month, janela - 1), to: monthRange(year, month).to })
      .then((result) => {
        if (active) setNetWorth(result);
      })
      .catch(() => {
        // O patrimônio é um card a mais: falhar aqui não pode derrubar a
        // Visão geral inteira. O card mostra o esqueleto e a pessoa segue.
        if (active) setNetWorth(null);
      });

    return () => {
      active = false;
    };
  }, [year, month, janela, versaoSaldo]);

  const balancePositive = (data?.balanceCents ?? 0) >= 0;

  /**
   * Variação contra o mês anterior. Sai da série do ano, que já veio
   * junto para o gráfico — pedir de novo ao servidor seria uma chamada a
   * mais para um dado que já está na mão.
   */
  const variacao = useMemo((): { income: Variacao | null; expense: Variacao | null } | null => {
    const serie = data?.monthly ?? [];
    const atual = `${year}-${String(month).padStart(2, '0')}`;
    const anteriorMes = monthsBefore(year, month, 1).slice(0, 7);

    const hoje = serie.find((m) => m.month === atual);
    const antes = serie.find((m) => m.month === anteriorMes);
    if (!hoje || !antes) return null;

    // Sem base não há variação a declarar: "+100%" só diria que o mês
    // passado não teve movimento nenhum naquela linha.
    const varia = (agora: number, base: number, subirEBom: boolean): Variacao | null =>
      base > 0 ? { percent: Math.round(((agora - base) / base) * 100), subirEBom } : null;

    return {
      income: varia(hoje.incomeCents, antes.incomeCents, true),
      expense: varia(hoje.expenseCents, antes.expenseCents, false),
    };
  }, [data, year, month]);

  // Quanto da renda não virou consumo. Vem pronto do servidor porque a
  // conta depende de o que é aporte e o que é gasto — que é justamente a
  // distinção que esta versão passou a fazer.
  const taxaPoupanca = data?.savingRatePercent ?? null;

  const doMes = monthRange(year, month);
  const daJanela = { from: monthsBefore(year, month, janela - 1), to: doMes.to };

  /** Recorte do mês: cards de topo e despesas por categoria. */
  const drillDoMes = (parcial: Omit<Drill, 'from' | 'to' | 'origem'>) =>
    onDrill({ ...parcial, ...doMes, origem: 'Visão geral' });

  /** Recorte da janela de análise: recorrentes e variações. */
  const drillDaJanela = (parcial: Omit<Drill, 'from' | 'to' | 'origem'>) =>
    onDrill({ ...parcial, ...daJanela, origem: 'Visão geral' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Visão geral</h1>
          <p className="page-subtitle">
            Transferências entre suas contas — como o pagamento da fatura — ficam de fora dos
            totais. E aporte em investimento não é despesa: sai da conta, mas vira patrimônio.
          </p>
        </div>
        <div className="filters" style={{ marginBottom: 0 }}>
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
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      <div className="kpi-row">
        <Kpi
          rotulo="Receitas"
          valor={data?.incomeCents ?? 0}
          cor="green"
          tom="si-green"
          icone={<polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />}
          carregando={loading}
          variacao={variacao?.income ?? null}
        />
        <Kpi
          rotulo="Despesas"
          valor={data?.expenseCents ?? 0}
          cor="red"
          tom="si-red"
          icone={<polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />}
          carregando={loading}
          variacao={variacao?.expense ?? null}
          nota={
            (data?.expenseOnCardCents ?? 0) > 0
              ? `${money(data?.expenseOnCardCents ?? 0)} ainda vai sair na fatura`
              : 'Só consumo — aporte não entra aqui'
          }
        />
        <Kpi
          rotulo="Guardado"
          valor={data?.savingCents ?? 0}
          tom="si-gold"
          icone={
            <>
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </>
          }
          carregando={loading}
          nota="Aporte em investimento, líquido de resgates"
        />
        <Kpi
          rotulo="Sobrou na conta"
          valor={data?.balanceCents ?? 0}
          {...(balancePositive ? {} : { cor: 'red' as const })}
          tom="si-teal"
          icone={
            <>
              <rect x="2" y="5" width="20" height="14" rx="3" />
              <path d="M2 10h20" />
            </>
          }
          carregando={loading}
          nota={
            taxaPoupanca === null
              ? balancePositive
                ? 'Receitas maiores que despesas'
                : 'Despesas maiores que receitas'
              : `Guardou ${taxaPoupanca}% da renda, contando o aporte`
          }
        />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2 className="card-title">Patrimônio</h2>
            <p className="card-sub">O que você tem menos o que já deve</p>
          </div>
        </div>
        <NetWorthCard data={netWorth} onChanged={() => setVersaoSaldo((v) => v + 1)} />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Evolução mensal</h2>
              <p className="card-sub">Receitas contra despesas</p>
            </div>
          </div>
          {/* Doze meses em 330px deixam os rótulos ilegíveis: no celular
              mostramos os seis últimos, que é a janela que interessa. */}
          <MonthlyChart data={data?.monthly ?? []} year={year} months={isMobile ? 6 : 12} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Despesas por categoria</h2>
              <p className="card-sub">Distribuição de {MONTHS[month - 1]}</p>
            </div>
          </div>
          {loading ? (
            <div className="stack">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          ) : (
            <DonutChart data={data?.expensesByCategory ?? []} onDrill={drillDoMes} />
          )}
        </div>
      </div>

      <div className="two-col">
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
              <option value={1}>só o mês de referência</option>
              <option value={2}>últimos 2 meses</option>
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
            {janela > 1
              ? `${MONTHS[month - 1]} comparado à média dos últimos ${janela} meses`
              : `Despesas de ${MONTHS[month - 1]}`}
          </h2>
          {erroSnapshot ? (
            <div className="notice error">{erroSnapshot}</div>
          ) : snapshot ? (
            <TrendList
              trends={snapshot.trends}
              canCompare={snapshot.canCompare}
              onDrill={drillDoMes}
            />
          ) : (
            <div className="stack">
              {[0, 1, 2].map((i) => (
                <span key={i} className="skeleton" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Analisar com o Claude</h2>
        <p className="page-subtitle" style={{ marginBottom: 14 }}>
          {janela > 1
            ? `Gera um resumo dos últimos ${janela} meses — totais, assinaturas, recorrentes e variações — já com o contexto necessário para uma conversa sobre onde economizar.`
            : `Gera um resumo só de ${MONTHS[month - 1]} — totais e gasto por categoria. Assinaturas e variações precisam de mais meses na janela.`}
        </p>
        <ExportSummary month={`${year}-${String(month).padStart(2, '0')}`} months={janela} />
      </div>
    </>
  );
}
