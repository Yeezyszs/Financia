import { useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { NetWorth } from '../api/types.js';
import { date, money } from '../format.js';

/**
 * Patrimônio líquido e reserva de emergência.
 *
 * O app só sabia fluxo, e fluxo não responde "dá para ficar quantos meses
 * sem renda" — a pergunta que decide se um gasto grande cabe. Isso exige
 * estoque, e estoque exige alguém dizer o saldo de algum dia: CSV de
 * extrato não traz o de hoje.
 */
export function NetWorthCard({
  data,
  onChanged,
}: {
  data: NetWorth | null;
  onChanged: () => void;
}): ReactNode {
  const [informando, setInformando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [quando, setQuando] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!data) {
    return (
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton" />
        ))}
      </div>
    );
  }

  async function salvar(accountId: string): Promise<void> {
    // Vírgula é como se digita dinheiro em português; o ponto é o
    // separador de milhar e não tem lugar no número.
    const limpo = valor.replace(/\./g, '').replace(',', '.');
    const numero = Number(limpo);
    if (!Number.isFinite(numero)) {
      setErro('Valor inválido. Use algo como 1.234,56');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      await api.setAccountBalance(accountId, {
        onDate: quando,
        balanceCents: Math.round(numero * 100),
      });
      setInformando(null);
      setValor('');
      onChanged();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar o saldo.');
    } finally {
      setSalvando(false);
    }
  }

  const correntes = data.accounts.filter((a) => a.type === 'checking');
  const cartoes = data.accounts.filter((a) => a.type === 'credit_card');

  return (
    <div className="stack">
      <div className="patrimonio-topo">
        <div>
          <p className="kpi-label">Patrimônio líquido</p>
          <div
            className="kpi-value"
            style={{ color: data.netWorthCents < 0 ? 'var(--danger)' : undefined }}
          >
            {money(data.netWorthCents)}
          </div>
          <p className="kpi-hint">
            {money(data.cashCents)} em conta − {money(data.cardDebtCents)} de fatura em aberto
          </p>
        </div>

        <div>
          <p className="kpi-label">Reserva</p>
          <div className="kpi-value">
            {data.monthsOfRunway === null
              ? '—'
              : `${data.monthsOfRunway.toLocaleString('pt-BR')} meses`}
          </div>
          <p className="kpi-hint">
            {data.monthsOfRunway === null
              ? 'Informe o saldo de uma conta para calcular'
              : `Vivendo com ${money(data.costOfLivingCents)} por mês`}
          </p>
        </div>
      </div>

      {data.accountsMissingBalance > 0 ? (
        <div className="notice aviso">
          {data.accountsMissingBalance === 1
            ? 'Uma conta corrente ainda não tem saldo informado'
            : `${data.accountsMissingBalance} contas correntes ainda não têm saldo informado`}
          . Sem isso o patrimônio fica incompleto — pegue o saldo no app do banco e informe abaixo,
          com a data. O app leva daí para a frente somando as transações.
        </div>
      ) : null}

      {correntes.map((conta) => (
        <div className="posicao" key={conta.accountId}>
          <span className="rec-label">{conta.name}</span>
          <span className="cat-value">{conta.known ? money(conta.amountCents) : '—'}</span>
          <span className="rec-meta">
            {conta.known && conta.asOf
              ? `a partir do saldo de ${date(conta.asOf)}`
              : 'saldo nunca informado'}
            {' · '}
            <button
              className="link acao"
              onClick={() => {
                setInformando(informando === conta.accountId ? null : conta.accountId);
                setErro(null);
              }}
            >
              {conta.known ? 'atualizar saldo' : 'informar saldo'}
            </button>
          </span>

          {informando === conta.accountId ? (
            <div className="informar-saldo">
              <div className="field">
                <label htmlFor={`saldo-${conta.accountId}`}>Saldo</label>
                <input
                  id={`saldo-${conta.accountId}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="1.234,56"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`data-${conta.accountId}`}>Nesta data</label>
                <input
                  id={`data-${conta.accountId}`}
                  type="date"
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                />
              </div>
              <button
                className="primary"
                disabled={salvando || !valor.trim()}
                onClick={() => void salvar(conta.accountId)}
              >
                Salvar
              </button>
            </div>
          ) : null}
        </div>
      ))}

      {cartoes.length > 0 ? (
        <div>
          <h3 className="card-title">Fatura em aberto</h3>
          {cartoes.map((conta) => (
            <div className="posicao" key={conta.accountId}>
              <span className="rec-label">{conta.name}</span>
              <span className="cat-value">{money(conta.amountCents)}</span>
              <span className="rec-meta">
                {conta.asOf
                  ? `compras desde o pagamento de ${date(conta.asOf)}`
                  : 'nenhum pagamento de fatura registrado ainda'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {erro ? <div className="notice error">{erro}</div> : null}
    </div>
  );
}
