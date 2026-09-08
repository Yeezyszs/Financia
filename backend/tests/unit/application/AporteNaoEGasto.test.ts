import { describe, expect, it } from 'vitest';
import { GetOverviewUseCase } from '../../../src/application/use-cases/reports/GetOverviewUseCase.js';
import { Category } from '../../../src/domain/entities/Category.js';
import type {
  CategoryTotal,
  MonthlyTotal,
} from '../../../src/application/ports/repositories/TransactionRepository.js';
import { InMemoryCategoryRepository, USER_ID } from '../../doubles/InMemoryRepositories.js';

function categoria(id: string, name: string, kind: 'expense' | 'income' | 'saving') {
  return new Category({ id, userId: USER_ID, name, kind, color: null, icon: null, isSystem: true });
}

/**
 * Só as duas agregações interessam aqui, e elas vêm de funções do banco:
 * o dobro devolve o que o Postgres devolveria.
 */
function repositorio(totals: CategoryTotal[], monthly: MonthlyTotal[] = []) {
  return {
    totalsByCategory: async () => totals,
    monthlyTotals: async () => monthly,
  } as never;
}

/** Agosto/2026 do Pedro, arredondado: salário, consumo e um aporte. */
const AGOSTO: CategoryTotal[] = [
  { categoryId: 'salario', incomeCents: 486994, expenseCents: 0, count: 2 },
  { categoryId: 'alimentacao', incomeCents: 0, expenseCents: 212992, count: 30 },
  { categoryId: 'investimentos', incomeCents: 0, expenseCents: 267000, count: 7 },
];

const CATEGORIAS = [
  categoria('salario', 'Salário', 'income'),
  categoria('alimentacao', 'Alimentação', 'expense'),
  categoria('investimentos', 'Investimentos', 'saving'),
];

describe('aporte fora da despesa', () => {
  it('não conta investimento como gasto', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio(AGOSTO),
      new InMemoryCategoryRepository(CATEGORIAS),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    expect(overview.expenseCents).toBe(212992);
    expect(overview.savingCents).toBe(267000);
    // o dinheiro não some: receita − consumo − aporte
    expect(overview.balanceCents).toBe(486994 - 212992 - 267000);
    // e o aporte não aparece na lista de despesas por categoria
    expect(overview.expensesByCategory.map((c) => c.categoryId)).toEqual(['alimentacao']);
  });

  it('a taxa de poupança conta o que ficou parado na conta, não só o aporte', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio(AGOSTO),
      new InMemoryCategoryRepository(CATEGORIAS),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    // (486994 − 212992) / 486994 = 56%, e não os 18% que sairiam de
    // tratar o aporte como despesa
    expect(overview.savingRatePercent).toBe(56);
  });

  it('resgate abate o aporte em vez de virar receita', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio([
        { categoryId: 'salario', incomeCents: 300000, expenseCents: 0, count: 1 },
        { categoryId: 'investimentos', incomeCents: 100000, expenseCents: 267000, count: 8 },
      ]),
      new InMemoryCategoryRepository(CATEGORIAS),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-08-01',
      to: '2026-08-31',
      year: 2026,
    });

    expect(overview.savingCents).toBe(167000);
    expect(overview.incomeCents).toBe(300000);
  });

  it('sem receita no período a taxa é nula, não zero', async () => {
    const useCase = new GetOverviewUseCase(
      repositorio([{ categoryId: 'alimentacao', incomeCents: 0, expenseCents: 5000, count: 1 }]),
      new InMemoryCategoryRepository(CATEGORIAS),
    );

    const overview = await useCase.execute({
      userId: USER_ID,
      from: '2026-09-01',
      to: '2026-09-30',
      year: 2026,
    });

    expect(overview.savingRatePercent).toBeNull();
  });
});
