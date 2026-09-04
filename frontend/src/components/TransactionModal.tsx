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
  onUpdated,
  onClose,
}: {
  transaction: Transaction;
  categories: Category[];
  accountLabel: string;
  onCategorize: (transactionId: string, categoryId: string | null) => Promise<void>;
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  const direcao: 'expense' | 'income' =
    otimista.direction ?? (transaction.amountCents > 0 ? 'income' : 'expense');
  const naoContar = otimista.isTransfer ?? transaction.isTransfer;

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
