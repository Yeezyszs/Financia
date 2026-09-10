import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Account, Category, InstallmentPlan, InstallmentsOverview } from '../api/types.js';
import { date, money, monthName } from '../format.js';
import { PlanoParcelas } from '../components/PlanoParcelas.js';

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
 * parcela como paga sozinhas. Quando não carregam — e muitos bancos não
 * carregam — o vínculo é apontado à mão, parcela por parcela.
 */

interface Rascunho {
  accountId: string;
  description: string;
  merchantKey: string;
  valor: string;
  quantas: string;
  primeira: string;
  categoryId: string;
}

/** Centavos a partir do que foi digitado: "1.234,56" e "1234.56" valem. */
function lerValor(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.');
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) : null;
}

function comoTexto(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * O mesmo formulário para criar e para corrigir.
 *
 * Corrigir tem um campo a mais — a chave de reconhecimento — porque só
 * faz sentido depois que a compra existe e as cobranças começam (ou não)
 * a ser reconhecidas.
 */
function FormularioPlano({
  titulo,
  subtitulo,
  rascunho,
  accounts,
  categories,
  comChave,
  salvando,
  rotuloSalvar,
  onSalvar,
  onCancelar,
}: {
  titulo: string;
  subtitulo: string;
  rascunho: Rascunho;
  accounts: Account[];
  categories: Category[];
  comChave: boolean;
  salvando: boolean;
  rotuloSalvar: string;
  onSalvar: (valores: Rascunho) => void;
  onCancelar: () => void;
}): ReactNode {
  const [valores, setValores] = useState<Rascunho>(rascunho);
  const mudar = (campo: keyof Rascunho, valor: string): void =>
    setValores((atual) => ({ ...atual, [campo]: valor }));

  const prefixo = comChave ? 'edit' : 'novo';
  const parcelas = Number(valores.quantas);
  const total = lerValor(valores.valor);
  const porMes = total && parcelas >= 2 ? Math.round(total / parcelas) : null;

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div>
          <h2 className="card-title">{titulo}</h2>
          <p className="card-sub">{subtitulo}</p>
        </div>
      </div>

      <div className="filters">
        <div className="field" style={{ flex: 2, minWidth: 190 }}>
          <label htmlFor={`${prefixo}-desc`}>Descrição</label>
          <input
            id={`${prefixo}-desc`}
            value={valores.description}
            onChange={(e) => mudar('description', e.target.value)}
            placeholder="Ex.: Moto"
            autoFocus
          />
        </div>

        {comChave ? (
          <div className="field" style={{ flex: 2, minWidth: 190 }}>
            <label htmlFor={`${prefixo}-chave`}>Como aparece na fatura</label>
            <input
              id={`${prefixo}-chave`}
              value={valores.merchantKey}
              onChange={(e) => mudar('merchantKey', e.target.value)}
              placeholder="Ex.: HONDA MOTOS *CG160"
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor={`${prefixo}-conta`}>Cartão</label>
          <select
            id={`${prefixo}-conta`}
            value={valores.accountId}
            onChange={(e) => mudar('accountId', e.target.value)}
          >
            {accounts.map((conta) => (
              <option key={conta.id} value={conta.id}>
                {conta.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${prefixo}-total`}>Valor total</label>
          <input
            id={`${prefixo}-total`}
            inputMode="decimal"
            value={valores.valor}
            onChange={(e) => mudar('valor', e.target.value)}
            placeholder="1.234,56"
          />
        </div>

        <div className="field" style={{ minWidth: 96 }}>
          <label htmlFor={`${prefixo}-qtd`}>Parcelas</label>
          <input
            id={`${prefixo}-qtd`}
            type="number"
            min={2}
            max={72}
            value={valores.quantas}
            onChange={(e) => mudar('quantas', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${prefixo}-primeira`}>Primeira cobrança</label>
          <input
            id={`${prefixo}-primeira`}
            type="date"
            value={valores.primeira}
            onChange={(e) => mudar('primeira', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${prefixo}-cat`}>Categoria</label>
          <select
            id={`${prefixo}-cat`}
            value={valores.categoryId}
            onChange={(e) => mudar('categoryId', e.target.value)}
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

      {/* Confundir o valor da parcela com o total é o erro fácil aqui, e
          ele só aparece meses depois. A conta feita na hora denuncia. */}
      {porMes ? (
        <p className="card-sub" style={{ marginTop: 0 }}>
          Dá <b>{money(porMes)}</b> por mês em {parcelas}x.
        </p>
      ) : null}

      <div className="row">
        <button
          className="primary"
          disabled={salvando || !valores.description.trim() || !total || !valores.accountId}
          onClick={() => onSalvar(valores)}
        >
          {salvando ? 'Salvando...' : rotuloSalvar}
        </button>
        <button className="ghost" disabled={salvando} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

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
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .installments()
      .then(setDados)
      .catch((err: Error) => setErro(err.message));
  }, []);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    if (!aviso) return;
    const timer = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(timer);
  }, [aviso]);

  // Parcelamento vive no cartão. Propor conta corrente aqui é oferecer o
  // caminho errado como padrão.
  const cartaoPadrao = (accounts.find((conta) => conta.type === 'credit_card') ?? accounts[0])?.id;

  async function criar(valores: Rascunho): Promise<void> {
    const total = lerValor(valores.valor);
    if (!total) {
      setErro('Valor total inválido. Use algo como 1.234,56');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const { linked } = await api.createInstallmentPlan({
        accountId: valores.accountId,
        description: valores.description.trim(),
        totalCents: total,
        installments: Number(valores.quantas),
        firstChargeOn: valores.primeira,
        ...(valores.categoryId ? { categoryId: valores.categoryId } : {}),
      });

      setCriando(false);
      setAviso(
        linked > 0
          ? `Parcelamento criado. ${linked} ${
              linked === 1
                ? 'cobrança já no extrato foi reconhecida'
                : 'cobranças já no extrato foram reconhecidas'
            }.`
          : 'Parcelamento criado. As próximas cobranças serão reconhecidas na importação — e as que não forem, você liga à mão em “ver parcelas”.',
      );
      carregar();
      onChanged();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui criar o parcelamento.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(planoId: string, valores: Rascunho): Promise<void> {
    const total = lerValor(valores.valor);
    if (!total) {
      setErro('Valor total inválido. Use algo como 1.234,56');
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      const { unlinked } = await api.updateInstallmentPlan(planoId, {
        accountId: valores.accountId,
        description: valores.description.trim(),
        merchantKey: valores.merchantKey.trim(),
        totalCents: total,
        installments: Number(valores.quantas),
        firstChargeOn: valores.primeira,
        categoryId: valores.categoryId || null,
      });

      setEditando(null);
      setAviso(
        unlinked > 0
          ? `Parcelamento corrigido. ${unlinked} ${
              unlinked === 1 ? 'cobrança que estava ligada' : 'cobranças que estavam ligadas'
            } a uma parcela que deixou de existir ${unlinked === 1 ? 'foi solta' : 'foram soltas'} — as transações continuam no extrato.`
          : 'Parcelamento corrigido.',
      );
      carregar();
      onChanged();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar a correção.');
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

  /** Troca um plano no lugar, sem recarregar a lista inteira. */
  function substituir(plano: InstallmentPlan): void {
    setDados((atual) => {
      if (!atual) return atual;
      const plans = atual.plans.map((p) => (p.id === plano.id ? plano : p));
      const abertos = plans.filter((p) => !p.settled);
      return {
        plans,
        remainingCents: abertos.reduce((soma, p) => soma + p.remainingCents, 0),
        monthlyCents: abertos.reduce((soma, p) => soma + p.monthlyCents, 0),
        openPlans: abertos.length,
      };
    });
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
            parcela — “Parcela 4/6” — são reconhecidas na importação; as que chegam sem marca você
            liga à mão em <b>ver parcelas</b>.
          </p>
        </div>
        {!criando ? (
          <button className="primary" onClick={() => setCriando(true)}>
            + Nova compra parcelada
          </button>
        ) : null}
      </div>

      {erro ? <div className="notice error">{erro}</div> : null}

      <div className="kpi-row tres">
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

      {criando && cartaoPadrao ? (
        <FormularioPlano
          titulo="Nova compra parcelada"
          subtitulo="Escreva a descrição como ela aparece na fatura — é por ela que as cobranças são reconhecidas."
          comChave={false}
          rascunho={{
            accountId: cartaoPadrao,
            description: '',
            merchantKey: '',
            valor: '',
            quantas: '2',
            primeira: new Date().toISOString().slice(0, 10),
            categoryId: '',
          }}
          accounts={accounts}
          categories={categories}
          salvando={salvando}
          rotuloSalvar="Criar parcelamento"
          onSalvar={(valores) => void criar(valores)}
          onCancelar={() => setCriando(false)}
        />
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
            {dados.plans.map((plano) =>
              editando === plano.id ? (
                <FormularioPlano
                  key={plano.id}
                  titulo={`Corrigir “${plano.description}”`}
                  subtitulo="Mudar o valor ou o número de parcelas refaz o calendário. As parcelas que continuarem existindo mantêm o lançamento que já estava ligado."
                  comChave
                  rascunho={{
                    accountId: plano.accountId,
                    description: plano.description,
                    merchantKey: plano.merchantKey,
                    valor: comoTexto(plano.totalCents),
                    quantas: String(plano.installments),
                    primeira: plano.firstChargeOn,
                    categoryId: plano.categoryId ?? '',
                  }}
                  accounts={accounts}
                  categories={categories}
                  salvando={salvando}
                  rotuloSalvar="Salvar correção"
                  onSalvar={(valores) => void salvarEdicao(plano.id, valores)}
                  onCancelar={() => setEditando(null)}
                />
              ) : (
                <article className="tx-item plano-item" key={plano.id}>
                  <div className="plano-topo">
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
                          caíram e quantas ainda vêm, sem ler números. */}
                      <div className="parcela-trilha" aria-hidden="true">
                        {plano.parcelas.map((parcela) => (
                          <span
                            key={parcela.number}
                            className={parcela.paid ? 'parcela-casa paga' : 'parcela-casa'}
                            title={`Parcela ${parcela.number} · ${monthName(
                              parcela.dueOn.slice(0, 7),
                            )} · ${money(parcela.amountCents)}`}
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
                          <>
                            <button
                              className="link acao"
                              onClick={() =>
                                setAberto((atual) => (atual === plano.id ? null : plano.id))
                              }
                              aria-expanded={aberto === plano.id}
                            >
                              {aberto === plano.id ? 'esconder parcelas' : 'ver parcelas'}
                            </button>
                            <button className="link acao" onClick={() => setEditando(plano.id)}>
                              Editar
                            </button>
                            <button className="link acao" onClick={() => setConfirmando(plano.id)}>
                              Apagar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="tx-right">
                      <span className="tx-amount neg">
                        {plano.settled ? '—' : money(plano.remainingCents)}
                      </span>
                    </div>
                  </div>

                  {aberto === plano.id ? (
                    <PlanoParcelas plano={plano} onMudou={substituir} />
                  ) : null}
                </article>
              ),
            )}
          </div>
        )}
      </div>
    </>
  );
}
