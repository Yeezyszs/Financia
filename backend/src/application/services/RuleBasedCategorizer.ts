import type { Category } from '../../domain/entities/Category.js';
import type { CategoryRule } from '../../domain/entities/CategoryRule.js';
import type {
  CategorizationResult,
  TransactionCategorizer,
} from '../ports/services/TransactionCategorizer.js';

/**
 * Aplica as regras do usuário em ordem de prioridade (menor primeiro) e
 * para na primeira que casar. Recebe regras e categorias já carregadas —
 * numa importação de 300 linhas isso é uma consulta, não trezentas.
 */
export class RuleBasedCategorizer implements TransactionCategorizer {
  private readonly rules: CategoryRule[];
  private readonly categoriesById: Map<string, Category>;

  constructor(rules: CategoryRule[], categories: Category[]) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
    this.categoriesById = new Map(categories.map((category) => [category.id, category]));
  }

  categorize(input: { description: string; accountId: string }): CategorizationResult | null {
    for (const rule of this.rules) {
      if (!rule.matches(input.description, input.accountId)) continue;

      const category = this.categoriesById.get(rule.categoryId);
      if (!category) continue; // regra órfã (categoria removida) é ignorada

      return { category, ruleId: rule.id };
    }
    return null;
  }
}
