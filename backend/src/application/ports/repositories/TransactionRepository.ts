import type { Transaction } from '../../../domain/entities/Transaction.js';
import type { AnalyzableTransaction } from '../../../domain/analysis/RecurringDetector.js';

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

export interface CategoryMonthPoint {
  /** YYYY-MM */
  month: string;
  categoryId: string | null;
  incomeCents: number;
  expenseCents: number;
  count: number;
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

  /**
   * Transações que uma regra aprendida pode reclassificar: tudo que não
   * foi categorizado à mão. Traz só o necessário para casar o padrão.
   */
  listRecategorizable(
    userId: string,
  ): Promise<{ id: string; description: string; categoryId: string | null }[]>;

  /** Aplica uma categoria a várias transações de uma vez. */
  setCategoryForMany(
    userId: string,
    ids: string[],
    categoryId: string,
    isTransfer: boolean,
  ): Promise<void>;

  /** Série mensal por categoria no intervalo — base da análise de tendência. */
  categorySeries(userId: string, from: string, to: string): Promise<CategoryMonthPoint[]>;

  /**
   * Transações cruas do período, só o necessário para analisar. Não passa
   * por paginação: quem chama é a análise, que precisa do conjunto todo.
   */
  listForAnalysis(userId: string, from: string, to: string): Promise<AnalyzableTransaction[]>;
}
