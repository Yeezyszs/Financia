import type { Transaction } from '../../domain/entities/Transaction';
import type { TransactionFilter, TransactionRepository } from '../ports/repositories';

export interface TransactionListResult {
  items: Transaction[];
  totalCents: number;
}

export class ListTransactions {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(filter: TransactionFilter): Promise<TransactionListResult> {
    const items = await this.transactions.list({ ...filter, limit: filter.limit ?? 50 });
    // Estorno ja vem negativo, entao a soma simples e o gasto liquido real.
    const totalCents = items.reduce((sum, t) => sum + t.amount.cents, 0);
    return { items, totalCents };
  }
}
