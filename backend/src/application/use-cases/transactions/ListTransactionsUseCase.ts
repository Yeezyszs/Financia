import type { Transaction } from '../../../domain/entities/Transaction.js';
import type {
  Paginated,
  TransactionFilters,
  TransactionRepository,
} from '../../ports/repositories/TransactionRepository.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class ListTransactionsUseCase {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(input: { userId: string } & TransactionFilters): Promise<Paginated<Transaction>> {
    const { userId, ...filters } = input;
    return this.transactions.list(userId, {
      ...filters,
      limit: Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      offset: filters.offset ?? 0,
    });
  }
}
