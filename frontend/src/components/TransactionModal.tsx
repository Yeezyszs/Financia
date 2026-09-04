import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client.js';
import type { Category, Transaction } from '../api/types.js';
import { date, money } from '../format.js';
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
  onUpdated,
  onClose,
}: {
  transaction: Transaction;
  categories: Category[];
  accountLabel: string;
  onCategorize: (transactionId: string, categoryId: string | null) => Promise<void>;
  /** Cria a categoria pelo nome digitado e devolve a que passou a valer. */
  onCreateCategory: (name: string, kind: Category['kind']) => Promise<Category>;
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
  const [nomeNovo, setNomeNovo] = useState('');
  const [notas, setNotas] = useState(transaction.notes ?? '');
  const [estadoNotas, setEstadoNotas] = useState<'parado' | 'salvando' | 'salvo'>('parado');

  // O que já está no servidor. A observação é salva ao sair do campo, e
  // sem esta referência um Esc logo depois de digitar salvaria de novo o
  // mesmo texto — ou, pior, perderia o texto ainda não salvo.
  const salvo = useRef(transaction.notes ?? '');
  const atual = useRef(notas);
  atual.current = notas;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  const direcao: 'expense' | 'income' =
    otimista.direction ?? (transaction.amountCents > 0 ? 'income' : 'expense');
  const naoContar = otimista.isTransfer ?? transaction.isTransfer;

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
