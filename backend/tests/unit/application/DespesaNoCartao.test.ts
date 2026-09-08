import { describe, expect, it } from 'vitest';
import { GetOverviewUseCase } from '../../../src/application/use-cases/reports/GetOverviewUseCase.js';
import type {
  CategoryTotal,
  TransactionFilters,
} from '../../../src/application/ports/repositories/TransactionRepository.js';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  USER_ID,
  makeCard,
  makeCategory,
  makeChecking,
} from '../../doubles/InMemoryRepositories.js';

/**
 * A agregação vem de uma função do banco que filtra por conta. O dobro
 * respeita esse filtro, senão o teste passaria sem provar que o caso de
 * uso pediu a segunda passada só para os cartões.
 */
function repositorio(porConta: Record<string, CategoryTotal[]>) {
  return {
    async totalsByCategory(_userId: string, filters: TransactionFilters) {
      const contas = filters.accountIds ?? Object.keys(porConta);
      return contas.flatMap((id) => porConta[id] ?? []);
    },
    async monthlyTotals() {
      return [];
    },
  } as never;
}

const CATEGORIAS = [
  makeCategory('cat-food', 'Alimentação', 'expense'),
  makeCategory('cat-inv', 'Investimentos', 'saving'),
];

describe('despesa que ainda não saiu da conta', () => {
  it('separa o que foi na fatura do que já saiu', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio({
        'acc-checking': [{ categoryId: 'cat-food', incomeCents: 0, expenseCents: 40000, count: 4 }],
        'acc-card': [{ categoryId: 'cat-food', incomeCents: 0, expenseCents: 60000, count: 9 }],
      }),
      new InMemoryCategoryRepository(CATEGORIAS),
      new InMemoryAccountRepository([makeChecking(), makeCard()]),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    expect(overview.expenseCents).toBe(100000);
    expect(overview.expenseOnCardCents).toBe(60000);
  });

  it('aporte feito no cartão não conta como fatura de consumo', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio({
        'acc-card': [
          { categoryId: 'cat-food', incomeCents: 0, expenseCents: 60000, count: 9 },
          { categoryId: 'cat-inv', incomeCents: 0, expenseCents: 25000, count: 1 },
        ],
      }),
      new InMemoryCategoryRepository(CATEGORIAS),
      new InMemoryAccountRepository([makeCard()]),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    expect(overview.expenseOnCardCents).toBe(60000);
    expect(overview.savingCents).toBe(25000);
  });

  it('sem cartão nenhum, nada fica pendurado', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio({
        'acc-checking': [{ categoryId: 'cat-food', incomeCents: 0, expenseCents: 40000, count: 4 }],
      }),
      new InMemoryCategoryRepository(CATEGORIAS),
      new InMemoryAccountRepository([makeChecking()]),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    expect(overview.expenseOnCardCents).toBe(0);
  });
});
