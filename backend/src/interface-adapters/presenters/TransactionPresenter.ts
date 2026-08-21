import type { Transaction } from '../../domain/entities/Transaction.js';

export const TransactionPresenter = {
  toHttp(tx: Transaction) {
    return {
      id: tx.id,
      accountId: tx.accountId,
      categoryId: tx.categoryId,
      occurredOn: tx.occurredOn,
      description: tx.description,
      /** centavos com sinal — a UI formata. */
      amountCents: tx.amount.cents,
      amount: tx.amount.toDecimal(),
      isTransfer: tx.isTransfer,
      categorizedBy: tx.categorizedBy,
      source: tx.source,
      importId: tx.importId,
      notes: tx.notes,
    };
  },
};
