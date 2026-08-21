import type { Category } from '../../../domain/entities/Category.js';

export interface CategorizationResult {
  category: Category;
  ruleId: string;
}

/**
 * Decide a categoria de uma transação a partir do título. Porta separada
 * para que a heurística evolua (regras, histórico, ML) sem tocar no caso
 * de uso de importação.
 */
export interface TransactionCategorizer {
  categorize(input: { description: string; accountId: string }): CategorizationResult | null;
}
