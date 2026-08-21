import type { Category } from '../../../domain/entities/Category.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type {
  MonthlyTotal,
  TransactionRepository,
} from '../../ports/repositories/TransactionRepository.js';

export interface CategoryBreakdown {
  categoryId: string | null;
  name: string;
  color: string | null;
  /** Sempre positivo: é quanto se gastou naquela categoria. */
  totalCents: number;
  count: number;
}

export interface OverviewOutput {
  period: { from: string; to: string };
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  expensesByCategory: CategoryBreakdown[];
  monthly: MonthlyTotal[];
}

/**
 * Alimenta a Visão Geral inteira numa chamada só: totais do período,
 * despesas por categoria e a série do ano para o gráfico de evolução.
 *
 * Transferências já ficam de fora nas duas agregações (é o `not
 * is_transfer` das funções do banco), então o pagamento de fatura não
 * aparece nem como despesa na conta nem como receita no cartão.
 */
export class GetOverviewUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    from: string;
    to: string;
    year: number;
    accountIds?: string[];
  }): Promise<OverviewOutput> {
    const filters = {
      from: input.from,
      to: input.to,
      ...(input.accountIds?.length ? { accountIds: input.accountIds } : {}),
    };

    const [totals, monthly, categories] = await Promise.all([
      this.transactions.totalsByCategory(input.userId, filters),
      this.transactions.monthlyTotals(input.userId, input.year),
      this.categories.listByUser(input.userId),
    ]);

    const byId = new Map<string, Category>(categories.map((c) => [c.id, c]));

    let incomeCents = 0;
    let expenseCents = 0;
    const expensesByCategory: CategoryBreakdown[] = [];

    for (const total of totals) {
      incomeCents += total.incomeCents;
      expenseCents += total.expenseCents;

      if (total.expenseCents === 0) continue;

      const category = total.categoryId ? byId.get(total.categoryId) : undefined;
      expensesByCategory.push({
        categoryId: total.categoryId,
        name: category?.name ?? 'Sem categoria',
        color: category?.color ?? null,
        totalCents: total.expenseCents,
        count: total.count,
      });
    }

    expensesByCategory.sort((a, b) => b.totalCents - a.totalCents);

    return {
      period: { from: input.from, to: input.to },
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
      expensesByCategory,
      monthly,
    };
  }
}
