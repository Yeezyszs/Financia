import type { Transaction } from '../../../domain/entities/Transaction.js';

export interface TransactionFilters {
  accountIds?: string[];
  categoryIds?: string[];
  /** YYYY-MM-DD, inclusivo. */
  from?: string;
  to?: string;
  search?: string;
  includeTransfers?: boolean;
  onlyUncategorized?: boolean;
  limit?: number;
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface CategoryTotal {
  categoryId: string | null;
  /** Entrada e saída separadas: estorno não vira "receita" da categoria. */
  incomeCents: number;
  expenseCents: number;
  count: number;
}

export interface MonthlyTotal {
  /** YYYY-MM */
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface TransactionRepository {
  findById(userId: string, id: string): Promise<Transaction | null>;
  list(userId: string, filters: TransactionFilters): Promise<Paginated<Transaction>>;

  /** Dedupe: quais desses fingerprints já existem para o usuário. */
  findExistingFingerprints(userId: string, fingerprints: string[]): Promise<Set<string>>;

  createMany(transactions: Transaction[]): Promise<Transaction[]>;
  update(transaction: Transaction): Promise<Transaction>;
  delete(userId: string, id: string): Promise<void>;

  /** Agregações do dashboard — feitas no banco, não em memória. */
  totalsByCategory(userId: string, filters: TransactionFilters): Promise<CategoryTotal[]>;
  monthlyTotals(userId: string, year: number): Promise<MonthlyTotal[]>;
}
