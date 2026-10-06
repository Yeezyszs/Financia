import { describe, expect, it } from 'vitest';
import { GetFinancialSnapshotUseCase } from '../../../src/application/use-cases/insights/GetFinancialSnapshotUseCase.js';
import type {
  CategoryMonthPoint,
  TransactionRepository,
} from '../../../src/application/ports/repositories/TransactionRepository.js';
import type { AnalyzableTransaction } from '../../../src/domain/analysis/RecurringDetector.js';
import {
  InMemoryCategoryRepository,
  makeCategory,
  USER_ID,
} from '../../doubles/InMemoryRepositories.js';

function repo(series: CategoryMonthPoint[], raw: AnalyzableTransaction[]): TransactionRepository {
  return {
    categorySeries: async () => series,
    listForAnalysis: async () => raw,
  } as unknown as TransactionRepository;
}

const categorias = new InMemoryCategoryRepository([
  makeCategory('cat-sub', 'Assinaturas', 'expense'),
  makeCategory('cat-food', 'Alimentação', 'expense'),
]);

function tx(
  occurredOn: string,
  description: string,
  amountCents: number,
  categoryId: string | null,
) {
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

    expect(alimentacao).toMatchObject({
      currentCents: 150000,
      baselineCents: 100000,
      changePercent: 50,
    });
  });

  it('não inventa variação quando não há histórico', async () => {
    const series: CategoryMonthPoint[] = [
      { month: '2026-08', categoryId: 'cat-food', incomeCents: 0, expenseCents: 90000, count: 5 },
    ];
    const useCase = new GetFinancialSnapshotUseCase(repo(series, []), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-08' });

    expect(snapshot.trends[0]?.changePercent).toBe(0);
  });

  it('recorte de um mês diz o que não pode responder, em vez de devolver vazio', async () => {
    const raw = [tx('2026-08-05', 'Netflix.com', -5590, 'cat-sub')];
    const series: CategoryMonthPoint[] = [
      { month: '2026-08', categoryId: 'cat-sub', incomeCents: 0, expenseCents: 5590, count: 1 },
    ];

    const snapshot = await new GetFinancialSnapshotUseCase(repo(series, raw), categorias).execute({
      userId: USER_ID,
      referenceMonth: '2026-08',
      months: 1,
    });

    // Os totais do mês continuam valendo...
    expect(snapshot.expense.totalCents).toBe(5590);
    // ...mas comparar e detectar recorrência exigem mais de um mês, e
    // isso é dito e não deduzido de uma lista vazia.
    expect(snapshot.canCompare).toBe(false);
    expect(snapshot.canDetectRecurrence).toBe(false);
  });

  it('dois meses já permitem comparar, mas ainda não detectar recorrência', async () => {
    const snapshot = await new GetFinancialSnapshotUseCase(repo([], []), categorias).execute({
      userId: USER_ID,
      referenceMonth: '2026-08',
      months: 2,
    });

    expect(snapshot.canCompare).toBe(true);
    expect(snapshot.canDetectRecurrence).toBe(false);
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

/**
 * A comparação padrão é "este mês contra a média dos anteriores", e ela
 * mente quando o mês de referência ainda está correndo: no dia 6, seis
 * dias de gasto contra meses fechados viram uma queda de 96% que não
 * aconteceu. O recorte por bloco existe para isso — períodos do mesmo
 * tamanho, comparáveis entre si.
 */
describe('recorte da comparação por categoria', () => {
  const ponto = (month: string, categoryId: string, expenseCents: number): CategoryMonthPoint => ({
    month,
    categoryId,
    incomeCents: 0,
    expenseCents,
    count: 1,
  });

  // Abril a junho: R$ 300 por mês. Julho a setembro: R$ 150 por mês.
  // Outubro mal começou e tem R$ 10.
  const serie = [
    ponto('2026-04', 'cat-food', 30000),
    ponto('2026-05', 'cat-food', 30000),
    ponto('2026-06', 'cat-food', 30000),
    ponto('2026-07', 'cat-food', 15000),
    ponto('2026-08', 'cat-food', 15000),
    ponto('2026-09', 'cat-food', 15000),
    ponto('2026-10', 'cat-food', 1000),
  ];

  it('sem recorte, o mês pela metade parece um colapso de gasto', async () => {
    const useCase = new GetFinancialSnapshotUseCase(repo(serie, []), categorias);

    const snapshot = await useCase.execute({ userId: USER_ID, referenceMonth: '2026-10' });
    const food = snapshot.trends.find((t) => t.categoryId === 'cat-food');

    expect(food?.currentCents).toBe(1000);
    expect(food?.changePercent).toBeLessThan(-90);
  });

  it('com bloco de três meses, compara trimestre contra trimestre', async () => {
    const useCase = new GetFinancialSnapshotUseCase(repo(serie, []), categorias);

    const snapshot = await useCase.execute({
      userId: USER_ID,
      referenceMonth: '2026-10',
      months: 6,
      trendMonths: 3,
    });
    const food = snapshot.trends.find((t) => t.categoryId === 'cat-food');

    // ago+set+out contra mai+jun+jul
    expect(food?.currentCents).toBe(15000 + 15000 + 1000);
    expect(food?.baselineCents).toBe(30000 + 30000 + 15000);
    expect(food?.changePercent).toBe(-59);
    expect(snapshot.trendMonths).toBe(3);
  });

  it('busca o histórico que o bloco exige, mesmo além da janela pedida', async () => {
    // Janela de 3 meses com bloco de 3 precisa de 6 meses de série.
    const useCase = new GetFinancialSnapshotUseCase(repo(serie, []), categorias);

    const snapshot = await useCase.execute({
      userId: USER_ID,
      referenceMonth: '2026-10',
      months: 3,
      trendMonths: 3,
    });
    const food = snapshot.trends.find((t) => t.categoryId === 'cat-food');

    expect(food?.baselineCents).toBe(75000);
  });

  it('mudar o recorte não mexe nos totais da janela', async () => {
    const useCase = new GetFinancialSnapshotUseCase(repo(serie, []), categorias);
    const comum = { userId: USER_ID, referenceMonth: '2026-10', months: 3 };

    const sem = await useCase.execute(comum);
    const com = await useCase.execute({ ...comum, trendMonths: 3 });

    // ago + set + out, e nada de maio ou junho entrando pela porta dos fundos.
    expect(sem.expense.totalCents).toBe(31000);
    expect(com.expense.totalCents).toBe(sem.expense.totalCents);
  });

  it('bloco maior que o histórico compara contra o que existe', async () => {
    const curto = [ponto('2026-09', 'cat-food', 15000), ponto('2026-10', 'cat-food', 1000)];
    const useCase = new GetFinancialSnapshotUseCase(repo(curto, []), categorias);

    const snapshot = await useCase.execute({
      userId: USER_ID,
      referenceMonth: '2026-10',
      trendMonths: 3,
    });
    const food = snapshot.trends.find((t) => t.categoryId === 'cat-food');

    expect(food?.currentCents).toBe(16000);
    // Nada nos três meses anteriores: 0% em vez de um "+100%" inventado.
    expect(food?.baselineCents).toBe(0);
    expect(food?.changePercent).toBe(0);
  });
});
