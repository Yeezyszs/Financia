import type { Transaction } from '../../../domain/entities/Transaction.js';
import { NotFoundError } from '../../../domain/errors/DomainError.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

export type TransactionDirection = 'expense' | 'income';

export interface UpdateTransactionInput {
  userId: string;
  transactionId: string;
  /** Força saída ou entrada, invertendo o valor se preciso. */
  direction?: TransactionDirection;
  /** Fora do somatório de receitas e despesas. */
  isTransfer?: boolean;
  /** Observação livre; `null` apaga a que existia. */
  notes?: string | null;
}

/**
 * Correção manual de como uma transação é interpretada.
 *
 * Existe porque a convenção de sinal de cada banco é descoberta na
 * prática: um export novo pode publicar compra como positiva, e sem uma
 * saída manual a única alternativa seria esperar uma correção no parser.
 */
export class UpdateTransactionUseCase {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(input: UpdateTransactionInput): Promise<Transaction> {
    const transaction = await this.transactions.findById(input.userId, input.transactionId);
    if (!transaction) throw new NotFoundError('Transação', input.transactionId);

    let atualizada = transaction;
    if (input.direction) atualizada = atualizada.withDirection(input.direction);
    if (input.isTransfer !== undefined) atualizada = atualizada.withTransferFlag(input.isTransfer);
    if (input.notes !== undefined) atualizada = atualizada.withNotes(input.notes);

    if (atualizada === transaction) return transaction;

    return this.transactions.update(atualizada);
  }
}
