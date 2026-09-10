import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Category, InstallmentPlan, InstallmentsOverview, Transaction } from '../api/types.js';
import { date, money } from '../format.js';
import { lerParcela, primeiraCobranca, semMarca } from '../parcela.js';
import { CategoryPicker } from './CategoryPicker.js';

/**
 * Edição de uma transação.
 *
 * O que motivou a tela: a convenção de sinal varia entre bancos, e quando
 * ela sai errada a transação aparece como receita sem que nada na
 * listagem permita corrigir. Aqui despesa/receita é uma escolha explícita.
 *
 * Usa o `<dialog>` nativo por causa do que ele já traz pronto: Esc para
 * fechar, foco preso dentro da caixa e o resto da página inerte.
 */
export function TransactionModal({
  transaction,
  categories,
  accountLabel,
  onCategorize,
  onCreateCategory,
  focoNaCategoria,
  onUpdated,
  onClose,
}: {
  transaction: Transaction;
  categories: Category[];
  accountLabel: string;
  onCategorize: (transactionId: string, categoryId: string | null) => Promise<void>;
  /** Cria a categoria pelo nome digitado e devolve a que passou a valer. */
  onCreateCategory: (name: string, kind: Category['kind']) => Promise<Category>;
  /** Abre com o cursor já no campo de escrever a categoria. */
  focoNaCategoria?: boolean;
  onUpdated: (transaction: Transaction) => void;
  onClose: () => void;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // A escolha aparece marcada antes de o servidor responder. Esperar a ida
  // e volta para mover o botão faz o clique parecer que não pegou.
  const [otimista, setOtimista] = useState<{
    direction?: 'expense' | 'income';
    isTransfer?: boolean;
  }>({});

  const [criando, setCriando] = useState(false);
  const [criandoPlano, setCriandoPlano] = useState(false);
  const [planoFeito, setPlanoFeito] = useState<string | null>(null);
  const [parcelamentos, setParcelamentos] = useState<InstallmentsOverview | null>(null);
  const [ligando, setLigando] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [planoAlvo, setPlanoAlvo] = useState('');
  const [numeroAlvo, setNumeroAlvo] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [notas, setNotas] = useState(transaction.notes ?? '');
  const [estadoNotas, setEstadoNotas] = useState<'parado' | 'salvando' | 'salvo'>('parado');

  // O que já está no servidor. A observação é salva ao sair do campo, e
  // sem esta referência um Esc logo depois de digitar salvaria de novo o
  // mesmo texto — ou, pior, perderia o texto ainda não salvo.
  const salvo = useRef(transaction.notes ?? '');
  const atual = useRef(notas);
  atual.current = notas;

  const campoCategoria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    if (focoNaCategoria) campoCategoria.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Os parcelamentos vêm junto com a caixa: é o que permite dizer, sem
  // clique nenhum, que esta cobrança já é a parcela 3 de alguma compra.
  const recarregarPlanos = useCallback(() => {
    api
      .installments()
      .then(setParcelamentos)
      .catch(() => setParcelamentos(null));
  }, []);

  useEffect(recarregarPlanos, [recarregarPlanos]);

  const direcao: 'expense' | 'income' =
    otimista.direction ?? (transaction.amountCents > 0 ? 'income' : 'expense');
  const naoContar = otimista.isTransfer ?? transaction.isTransfer;
  const parcela = lerParcela(transaction.description);

  // Em que parcela esta cobrança está hoje, se estiver em alguma.
  const vinculo = (parcelamentos?.plans ?? [])
    .flatMap((plano) => plano.parcelas.map((p) => ({ plano, parcela: p })))
    .find((par) => par.parcela.transactionId === transaction.id);

  // Com vários parcelamentos abertos, o que tem parcela do mesmo valor
  // desta cobrança é quase sempre o certo — vai primeiro na lista, e o
  // padrão do seletor deixa de ser sorte.
  const combina = (plano: InstallmentPlan): boolean =>
    Math.abs(plano.monthlyCents - Math.abs(transaction.amountCents)) <= 1;

  const abertos = (parcelamentos?.plans ?? [])
    .filter((plano) => !plano.settled)
    .sort((a, b) => Number(combina(b)) - Number(combina(a)));
  const planoSelecionado = abertos.find((plano) => plano.id === planoAlvo) ?? abertos[0];

  async function salvarNotas(): Promise<void> {
    const texto = atual.current.trim();
    if (texto === salvo.current) return;

    setEstadoNotas('salvando');
    try {
      const atualizada = await api.updateTransaction(transaction.id, {
        notes: texto === '' ? null : texto,
      });
      salvo.current = atualizada.notes ?? '';
      onUpdated(atualizada);
      setEstadoNotas('salvo');
    } catch (err) {
      setEstadoNotas('parado');
      setErro(err instanceof Error ? err.message : 'Não consegui salvar a observação.');
    }
  }

  // Fechar com Esc não passa por blur em todo navegador: sem esta rede,
  // o que foi digitado por último sumiria sem aviso.
  useEffect(() => {
    return () => {
      void salvarNotas();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criarCategoria(): Promise<void> {
    const nome = nomeNovo.trim();
    if (!nome) return;

    setCriando(true);
    setErro(null);
    try {
      const categoria = await onCreateCategory(nome, direcao === 'income' ? 'income' : 'expense');
      setNomeNovo('');
      await onCategorize(transaction.id, categoria.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui criar a categoria.');
    } finally {
      setCriando(false);
    }
  }

  /**
   * Cadastra o parcelamento a partir desta cobrança.
   *
   * Tudo que o formulário da tela de Parcelas pede já está aqui: a
   * fatura diz em que parcela estamos e quanto ela custa, e o resto é
   * multiplicação e contagem de meses para trás. Pedir isso de novo, na
   * mão, em outra tela, seria só uma forma de perder gente no caminho.
   */
  async function criarPlano(): Promise<void> {
    if (!parcela) return;

    setCriandoPlano(true);
    setErro(null);
    try {
      const { linked } = await api.createInstallmentPlan({
        accountId: transaction.accountId,
        description: semMarca(transaction.description),
        totalCents: Math.abs(transaction.amountCents) * parcela.total,
        installments: parcela.total,
        firstChargeOn: primeiraCobranca(transaction.occurredOn, parcela.numero),
        ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
      });

      setPlanoFeito(
        linked > 1
          ? `Parcelamento criado, e ${linked} cobranças que já estavam no extrato foram reconhecidas.`
          : 'Parcelamento criado. As próximas cobranças dão baixa sozinhas na importação.',
      );
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui criar o parcelamento.');
    } finally {
      setCriandoPlano(false);
    }
  }

  /**
   * O vínculo no sentido contrário: partindo da cobrança, apontar de
   * que parcela ela é.
   *
   * O reconhecimento automático só enxerga o que a fatura marca com
   * "4/6". Um financiamento pago por Pix chega como "Transferência
   * enviada pelo Pix - BANCO TAL", sem nada que diga que aquilo é a
   * terceira de quarenta e oito — e é justamente o parcelamento mais
   * caro que fica de fora. Daqui a pessoa aponta, e o app passa a saber.
   */
  async function mexerNoVinculo(
    planId: string,
    numero: number,
    transactionId: string | null,
  ): Promise<void> {
    setLigando(true);
    setErro(null);
    try {
      await api.linkParcela(planId, numero, transactionId);
      setEscolhendo(false);
      recarregarPlanos();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui mudar o vínculo da parcela.');
    } finally {
      setLigando(false);
    }
  }

  async function salvar(body: {
    direction?: 'expense' | 'income';
    isTransfer?: boolean;
  }): Promise<void> {
    setSalvando(true);
    setErro(null);
    setOtimista((atual) => ({ ...atual, ...body }));
    try {
      onUpdated(await api.updateTransaction(transaction.id, body));
    } catch (err) {
      // Desfaz o palpite: um botão marcado sem que nada tenha sido salvo é
      // pior que a caixa não ter reagido.
      setOtimista({});
      setErro(err instanceof Error ? err.message : 'Não consegui salvar a alteração.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <dialog className="modal" ref={ref} onClose={onClose} aria-labelledby="modal-titulo">
      <div className="modal-head">
        <div>
          <h2 id="modal-titulo">{transaction.description}</h2>
          <p className="modal-sub">
            {date(transaction.occurredOn)} · {accountLabel}
          </p>
        </div>
        <button className="ghost icon" onClick={() => ref.current?.close()} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="modal-body">
        <div className={direcao === 'income' ? 'modal-valor amount-in' : 'modal-valor amount-out'}>
          {money(transaction.amountCents)}
        </div>

        <fieldset className="segmented" disabled={salvando}>
          <legend>Tipo</legend>
          <div className="segmented-options">
            {(
              [
                ['expense', 'Despesa'],
                ['income', 'Receita'],
              ] as const
            ).map(([valor, rotulo]) => (
              <label key={valor} className={direcao === valor ? 'segment ativo' : 'segment'}>
                <input
                  type="radio"
                  name="direcao"
                  value={valor}
                  checked={direcao === valor}
                  onChange={() => void salvar({ direction: valor })}
                />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="modal-categoria">Categoria</label>
          <CategoryPicker
            id="modal-categoria"
            value={transaction.categoryId}
            categories={categories}
            onChange={(categoryId) => onCategorize(transaction.id, categoryId)}
          />
          <div className="nova-categoria">
            <input
              ref={campoCategoria}
              type="text"
              value={nomeNovo}
              maxLength={40}
              placeholder="ou escreva uma categoria nova"
              aria-label="Nome da categoria nova"
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void criarCategoria();
                }
              }}
            />
            <button
              className="ghost"
              disabled={criando || !nomeNovo.trim()}
              onClick={() => void criarCategoria()}
            >
              Usar
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="modal-notas">
            Observações
            {estadoNotas === 'salvando' ? <small> salvando…</small> : null}
            {estadoNotas === 'salvo' ? <small> salvo</small> : null}
          </label>
          <textarea
            id="modal-notas"
            rows={3}
            maxLength={500}
            placeholder="O que foi essa compra, com quem dividiu, o que conferir depois..."
            value={notas}
            onChange={(e) => {
              setNotas(e.target.value);
              setEstadoNotas('parado');
            }}
            onBlur={() => void salvarNotas()}
          />
        </div>

        {/* Onde a pessoa procura parcela é na compra, não numa aba
            separada. A aba mostra o conjunto; aqui é onde ela nasce. */}
        {vinculo ? (
          <div className="field parcelamento">
            <span className="parcelamento-titulo">
              Parcela {vinculo.parcela.number} de {vinculo.plano.installments}
            </span>
            <p className="parcelamento-texto">
              Esta cobrança está contando como uma parcela de <b>{vinculo.plano.description}</b>,
              com vencimento em {date(vinculo.parcela.dueOn)}.
            </p>
            <button
              className="ghost"
              disabled={ligando}
              onClick={() => void mexerNoVinculo(vinculo.plano.id, vinculo.parcela.number, null)}
            >
              {ligando ? 'Soltando...' : 'Soltar desta parcela'}
            </button>
          </div>
        ) : escolhendo && planoSelecionado ? (
          <div className="field parcelamento">
            <span className="parcelamento-titulo">De qual parcela é esta cobrança?</span>

            <select
              aria-label="Parcelamento"
              value={planoSelecionado.id}
              onChange={(e) => {
                setPlanoAlvo(e.target.value);
                setNumeroAlvo('');
              }}
            >
              {abertos.map((plano) => (
                <option key={plano.id} value={plano.id}>
                  {plano.description} · {plano.paidCount}/{plano.installments}
                </option>
              ))}
            </select>

            <select
              aria-label="Parcela"
              value={
                numeroAlvo || String(planoSelecionado.parcelas.find((p) => !p.paid)?.number ?? 1)
              }
              onChange={(e) => setNumeroAlvo(e.target.value)}
            >
              {planoSelecionado.parcelas.map((p) => (
                <option key={p.number} value={p.number}>
                  {p.number}/{planoSelecionado.installments} · vence {date(p.dueOn)} ·{' '}
                  {money(p.amountCents)}
                  {p.transactionId
                    ? ' (já tem lançamento)'
                    : p.settled
                      ? ' (marcada como paga)'
                      : ''}
                </option>
              ))}
            </select>

            <div className="row">
              <button
                className="primary"
                disabled={ligando}
                onClick={() =>
                  void mexerNoVinculo(
                    planoSelecionado.id,
                    Number(
                      numeroAlvo || (planoSelecionado.parcelas.find((p) => !p.paid)?.number ?? 1),
                    ),
                    transaction.id,
                  )
                }
              >
                {ligando ? 'Ligando...' : 'Ligar a esta parcela'}
              </button>
              <button className="ghost" disabled={ligando} onClick={() => setEscolhendo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : parcela ? (
          <div className="field parcelamento">
            <span className="parcelamento-titulo">
              Parcela {parcela.numero} de {parcela.total}
            </span>
            {planoFeito ? (
              <p className="parcelamento-texto">
                {planoFeito} Veja o conjunto na aba <b>Parcelas</b>.
              </p>
            ) : (
              <>
                <p className="parcelamento-texto">
                  Cadastrando a compra inteira, o app passa a saber que ainda{' '}
                  {parcela.total - parcela.numero === 1
                    ? `falta 1 parcela de ${money(Math.abs(transaction.amountCents))}`
                    : `faltam ${parcela.total - parcela.numero} parcelas de ${money(
                        Math.abs(transaction.amountCents),
                      )}`}{' '}
                  — e dá baixa em cada uma na importação.
                </p>
                <button className="ghost" disabled={criandoPlano} onClick={() => void criarPlano()}>
                  {criandoPlano
                    ? 'Cadastrando...'
                    : `Cadastrar parcelamento de ${money(Math.abs(transaction.amountCents) * parcela.total)} em ${parcela.total}x`}
                </button>
              </>
            )}
          </div>
        ) : abertos.length > 0 ? (
          /* Sem marca na descrição não há como adivinhar — mas a pessoa
             sabe. Um financiamento pago por Pix é exatamente isto. */
          <div className="field parcelamento">
            <span className="parcelamento-titulo">Isto é uma parcela?</span>
            <p className="parcelamento-texto">
              A fatura não marcou esta cobrança como parcela, então o reconhecimento automático não
              a encontrou. Se ela for de uma compra parcelada, aponte qual.
            </p>
            <button className="ghost" onClick={() => setEscolhendo(true)}>
              Ligar a uma parcela
            </button>
          </div>
        ) : null}

        <label className="check-line">
          <input
            type="checkbox"
            checked={naoContar}
            disabled={salvando}
            onChange={(e) => void salvar({ isTransfer: e.target.checked })}
          />
          <span>
            Não contar nos totais
            <small>
              Para transferências entre contas e pagamento de fatura, que não são gasto nem renda.
            </small>
          </span>
        </label>

        {erro ? <div className="notice error">{erro}</div> : null}
      </div>

      <div className="modal-foot">
        <button className="ghost" onClick={() => ref.current?.close()}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}
