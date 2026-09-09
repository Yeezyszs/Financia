import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Account, Category, InstallmentsOverview } from '../api/types.js';
import { date, money, monthName } from '../format.js';

/**
 * Compras parceladas.
 *
 * A tela responde o que o extrato sozinho não responde: quanto do mês
 * que vem já está comprometido antes de gastar qualquer coisa. Uma
 * fatura diz "Parcela 4/6" e nada mais — que faltam duas só existe se
 * alguém guardar a compra inteira.
 *
 * O cadastro é manual, mas alimentar não: as linhas da fatura que
 * carregam a marca de parcela são reconhecidas na importação e marcam a
 * parcela como paga sozinhas.
 */
export function Installments({
  accounts,
  categories,
  onChanged,
}: {
  accounts: Account[];
  categories: Category[];
  onChanged: () => void;
}): ReactNode {
  const [dados, setDados] = useState<InstallmentsOverview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const [accountId, setAccountId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [quantas, setQuantas] = useState('2');
  const [primeira, setPrimeira] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');

  const carregar = useCallback(() => {
    api
      .installments()
      .then(setDados)
      .catch((err: Error) => setErro(err.message));
  }, []);

  useEffect(carregar, [carregar]);

  // Parcelamento vive no cartão. Ficar propondo conta corrente aqui é
  // oferecer o caminho errado como padrão.
  useEffect(() => {
    if (accountId) return;
    const cartao = accounts.find((conta) => conta.type === 'credit_card') ?? accounts[0];
    if (cartao) setAccountId(cartao.id);
  }, [accounts, accountId]);

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(timer);
  }, [aviso]);

  async function criar(): Promise<void> {
    const limpo = valor.replace(/\./g, '').replace(',', '.');
    const total = Number(limpo);
    const parcelas = Number(quantas);

    if (!Number.isFinite(total) || total <= 0) {
      setErro('Valor total inválido. Use algo como 1.234,56');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const { linked } = await api.createInstallmentPlan({
        accountId,
        description: descricao.trim(),
        totalCents: Math.round(total * 100),
        installments: parcelas,
        firstChargeOn: primeira,
        ...(categoryId ? { categoryId } : {}),
      });

      setAberto(false);
      setDescricao('');
      setValor('');
      setAviso(
        linked > 0
          ? `Parcelamento criado. ${linked} ${
              linked === 1
                ? 'cobrança já no extrato foi reconhecida'
                : 'cobranças já no extrato foram reconhecidas'
            }.`
          : 'Parcelamento criado. As próximas cobranças serão reconhecidas na importação.',
      );
      carregar();
      onChanged();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui criar o parcelamento.');
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string): Promise<void> {
    setSalvando(true);
    try {
      await api.deleteInstallmentPlan(id);
      setConfirmando(null);
      setAviso('Parcelamento apagado. As transações continuam onde estavam.');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui apagar.');
    } finally {
      setSalvando(false);
    }
  }

  const nomeDaConta = new Map(accounts.map((conta) => [conta.id, conta.name]));

  return (
    <>
      {aviso ? (
        <div className="toast" role="status">
          {aviso}
        </div>
      ) : null}

      <div className="page-head">
        <div>
          <h1 className="page-title">Parcelas</h1>
          <p className="page-subtitle">
            Cadastre a compra parcelada uma vez. As cobranças que chegam na fatura com a marca de
            parcela — “Parcela 4/6” — são reconhecidas na importação e dão baixa sozinhas.
          </p>
        </div>
        {!aberto ? (
          <button className="primary" onClick={() => setAberto(true)}>
            + Nova compra parcelada
          </button>
        ) : null}
      </div>

      {erro ? <div className="notice error">{erro}</div> : null}

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="scard">
          <div className="scard-top">
            <span className="scard-label">Falta pagar</span>
            <span className="scard-icon si-gold" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="2" y="5" width="20" height="14" rx="3" />
                <path d="M2 10h20" />
              </svg>
            </span>
          </div>
          <div className="scard-val">{dados ? money(dados.remainingCents) : '—'}</div>
          <p className="scard-change">
            <span>Somando tudo que ainda vai ser cobrado</span>
          </p>
        </div>

        <div className="scard">
          <div className="scard-top">
            <span className="scard-label">Peso mensal</span>
            <span className="scard-icon si-indigo" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <path d="M3 10h18M8 2v4M16 2v4" />
              </svg>
            </span>
          </div>
          <div className="scard-val">{dados ? money(dados.monthlyCents) : '—'}</div>
          <p className="scard-change">
            <span>Comprometido antes de gastar no mês</span>
          </p>
        </div>

        <div className="scard">
          <div className="scard-top">
            <span className="scard-label">Parcelamentos abertos</span>
            <span className="scard-icon si-teal" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </span>
          </div>
          <div className="scard-val">{dados ? dados.openPlans : '—'}</div>
          <p className="scard-change">
            <span>{dados ? `${dados.plans.length} no total, com os quitados` : '—'}</span>
          </p>
        </div>
      </div>

      {aberto ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <h2 className="card-title">Nova compra parcelada</h2>
              <p className="card-sub">
                Escreva a descrição como ela aparece na fatura — é por ela que as cobranças são
                reconhecidas.
              </p>
            </div>
          </div>

          <div className="filters">
            <div className="field" style={{ flex: 2, minWidth: 200 }}>
              <label htmlFor="par-desc">Descrição na fatura</label>
              <input
                id="par-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Mp *Aliexpress"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="par-conta">Cartão</label>
              <select
                id="par-conta"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="par-total">Valor total</label>
              <input
                id="par-total"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.234,56"
              />
            </div>
            <div className="field" style={{ minWidth: 100 }}>
              <label htmlFor="par-qtd">Parcelas</label>
              <input
                id="par-qtd"
                type="number"
                min={2}
                max={72}
                value={quantas}
                onChange={(e) => setQuantas(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="par-primeira">Primeira cobrança</label>
              <input
                id="par-primeira"
                type="date"
                value={primeira}
                onChange={(e) => setPrimeira(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="par-cat">Categoria</label>
              <select
                id="par-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">sem categoria</option>
                {categories.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="row">
            <button
              className="primary"
              disabled={salvando || !descricao.trim() || !valor.trim() || !accountId}
              onClick={() => void criar()}
            >
              {salvando ? 'Criando...' : 'Criar parcelamento'}
            </button>
            <button className="ghost" disabled={salvando} onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Compras parceladas</h2>
            <p className="card-sub">Quitadas ficam no fim da lista</p>
          </div>
        </div>

        {!dados ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" style={{ height: 62, borderRadius: 11 }} />
            ))}
          </div>
        ) : dados.plans.length === 0 ? (
          <div className="empty">
            Nenhuma compra parcelada cadastrada. Crie uma acima e as cobranças passam a dar baixa
            sozinhas a cada importação.
          </div>
        ) : (
          <div className="tx-list">
            {dados.plans.map((plano) => (
              <article className="tx-item" key={plano.id}>
                <span
                  className="tx-dot"
                  style={{
                    background: plano.settled ? 'var(--border-2)' : 'var(--gold-light)',
                    color: plano.settled ? 'var(--text-3)' : 'var(--gold)',
                  }}
                  aria-hidden="true"
                >
                  {plano.paidCount}/{plano.installments}
                </span>

                <div className="tx-info">
                  <span className="tx-name">{plano.description}</span>
                  <div className="tx-meta">
                    <span>{nomeDaConta.get(plano.accountId) ?? '—'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {money(plano.monthlyCents)}/mês de {money(plano.totalCents)}
                    </span>
                    {plano.settled ? (
                      <span className="pill pill-mudo">quitada</span>
                    ) : plano.nextDueOn ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>próxima em {date(plano.nextDueOn)}</span>
                      </>
                    ) : null}
                  </div>

                  {/* Uma casa por parcela: mostra de relance quantas
                      caíram e quantas ainda vêm, sem precisar ler números. */}
                  <div className="parcela-trilha" aria-hidden="true">
                    {plano.parcelas.map((parcela) => (
                      <span
                        key={parcela.number}
                        className={parcela.paid ? 'parcela-casa paga' : 'parcela-casa'}
                        title={`Parcela ${parcela.number} · ${monthName(parcela.dueOn.slice(0, 7))} · ${money(parcela.amountCents)}`}
                      />
                    ))}
                  </div>

                  <div className="tx-meta">
                    {confirmando === plano.id ? (
                      <span className="confirmacao">
                        <span className="confirmacao-texto">
                          Apagar o parcelamento? As transações continuam onde estão.
                        </span>
                        <button
                          className="ghost perigo"
                          disabled={salvando}
                          onClick={() => void apagar(plano.id)}
                        >
                          Apagar
                        </button>
                        <button className="link acao" onClick={() => setConfirmando(null)}>
                          cancelar
                        </button>
                      </span>
                    ) : (
                      <button className="link acao" onClick={() => setConfirmando(plano.id)}>
                        Apagar
                      </button>
                    )}
                  </div>
                </div>

                <div className="tx-right">
                  <span className="tx-amount neg">
                    {plano.settled ? '—' : money(plano.remainingCents)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
