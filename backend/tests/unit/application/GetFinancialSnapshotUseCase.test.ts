import { describe, expect, it } from 'vitest';
import { GetFinancialSnapshotUseCase } from '../../../src/application/use-cases/insights/GetFinancialSnapshotUseCase.js';
import type {
  CategoryMonthPoint,
  TransactionRepository,
} from '../../../src/application/ports/repositories/TransactionRepository.js';
import type { AnalyzableTransaction } from '../../../src/domain/analysis/RecurringDetector.js';
import { InMemoryCategoryRepository, makeCategory, USER_ID } from '../../doubles/InMemoryRepositories.js';

function repo(
  series: CategoryMonthPoint[],
  raw: AnalyzableTransaction[],
): TransactionRepository {
  return {
    categorySeries: async () => series,
    listForAnalysis: async () => raw,
  } as unknown as TransactionRepository;
}

const categorias = new InMemoryCategoryRepository([
  makeCategory('cat-sub', 'Assinaturas', 'expense'),
  makeCategory('cat-food', 'Alimentação', 'expense'),
]);

function tx(occurredOn: string, description: string, amountCents: number, categoryId: string | null) {
  return { occurredOn, description, amountCents, categoryId };
}

describe('GetFinancialSnapshotUseCase', () => {
  it('soma as assinaturas ativas como gasto fixo mensal', async () => {
    const raw = [
      tx('2026-06-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-07-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-08-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-06-08', 'Spotify', -2190, 'cat-sub'),
      tx('2026-07-08', 'Spotify', -2190, 'cat-sub'),
      tx('2026-08-08', 'Spotify', -2190, 'cat-sub'),
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo([], raw), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });

    expect(snapshot.subscriptions).toHaveLength(2);
    expect(snapshot.fixedMonthlyCents).toBe(5590 + 2190);
    expect(snapshot.subscriptions[0]?.categoryName).toBe('Assinaturas');
  });

  it('não conta como gasto fixo a assinatura que sumiu meses atrás', async () => {
    const raw = [
      tx('2026-02-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-03-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-04-05', 'Netflix.com', -5590, 'cat-sub'),
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo([], raw), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });

    expect(snapshot.subscriptions).toHaveLength(1);
    expect(snapshot.fixedMonthlyCents).toBe(0);
  });

  it('calcula a variação da categoria contra a média dos meses anteriores', async () => {
    const series: CategoryMonthPoint[] = [
      { month: '2026-06', categoryId: 'cat-food', incomeCents: 0, expenseCents: 100000, count: 10 },
      { month: '2026-07', categoryId: 'cat-food', incomeCents: 0, expenseCents: 100000, count: 10 },
      { month: '2026-08', categoryId: 'cat-food', incomeCents: 0, expenseCents: 150000, count: 12 },
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo(series, []), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });
    const alimentacao = snapshot.trends.find((t) => t.name === 'Alimentação');

    expect(alimentacao).toMatchObject({ currentCents: 150000, averageCents: 100000, changePercent: 50 });
  });

  it('não inventa variação quando não há histórico', async () => {
    const series: CategoryMonthPoint[] = [
      { month: '2026-08', categoryId: 'cat-food', incomeCents: 0, expenseCents: 90000, count: 5 },
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo(series, []), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });

    expect(snapshot.trends[0]?.changePercent).toBe(0);
  });

  it('separa gasto fixo de variável na média mensal', async () => {
    const series: CategoryMonthPoint[] = [
      { month: '2026-07', categoryId: 'cat-food', incomeCents: 0, expenseCents: 100000, count: 8 },
      { month: '2026-08', categoryId: 'cat-food', incomeCents: 0, expenseCents: 100000, count: 8 },
    ];
    const raw = [
      tx('2026-06-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-07-05', 'Netflix.com', -5590, 'cat-sub'),
      tx('2026-08-05', 'Netflix.com', -5590, 'cat-sub'),
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo(series, raw), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });

    expect(snapshot.expense.monthlyAverageCents).toBe(100000);
    expect(snapshot.fixedMonthlyCents).toBe(5590);
    expect(snapshot.variableMonthlyCents).toBe(100000 - 5590);
  });
});
