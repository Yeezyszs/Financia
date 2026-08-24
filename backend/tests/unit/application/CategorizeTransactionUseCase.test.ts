import { beforeEach, describe, expect, it } from 'vitest';
import { CategorizeTransactionUseCase } from '../../../src/application/use-cases/transactions/CategorizeTransactionUseCase.js';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import {
  InMemoryCategoryRepository,
  InMemoryCategoryRuleRepository,
  InMemoryTransactionRepository,
  SequentialIds,
  USER_ID,
  makeCategory,
} from '../../doubles/InMemoryRepositories.js';

function tx(id: string, description: string, categoryId: string | null = null) {
  return Transaction.create({
    id,
    userId: USER_ID,
    accountId: 'acc-1',
    occurredOn: '2026-08-10',
    description,
    amount: Money.fromCents(-5000),
    ...(categoryId ? { categoryId, categorizedBy: 'rule' as const } : {}),
  });
}

function setup(transactions: Transaction[]) {
  const transacoes = new InMemoryTransactionRepository(transactions);
  const categorias = new InMemoryCategoryRepository([
    makeCategory('cat-food', 'Alimentação', 'expense'),
    makeCategory('cat-market', 'Mercado', 'expense'),
    makeCategory('cat-transfer', 'Transferências', 'transfer'),
  ]);
  const regras = new InMemoryCategoryRuleRepository();
  const useCase = new CategorizeTransactionUseCase(
    transacoes,
    categorias,
    regras,
    new SequentialIds(),
  );
  return { useCase, transacoes, regras };
}

describe('CategorizeTransactionUseCase', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup([
      tx('t1', 'Ifood *Restaurante Sabor'),
      tx('t2', 'Ifood *Outro Lugar'),
      tx('t3', 'IFOOD *TERCEIRO'),
      tx('t4', 'Uber *TRIP'),
    ]);
  });

  it('categoriza a transação escolhida como manual', async () => {
    const { transaction } = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-food',
    });

    expect(transaction.categoryId).toBe('cat-food');
    expect(transaction.categorizedBy).toBe('manual');
  });

  it('sem lembrar, não cria regra nem toca nas outras', async () => {
    const resultado = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-food',
    });

    expect(resultado.learnedPattern).toBeNull();
    expect(resultado.alsoUpdatedIds).toEqual([]);
    expect(ctx.regras.rules).toHaveLength(0);
  });

  it('ao lembrar, cria a regra e aplica ao mesmo estabelecimento', async () => {
    const resultado = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-food',
      remember: true,
    });

    expect(resultado.learnedPattern).toBe('ifood');
    // t2 e t3 são o mesmo estabelecimento com sufixos diferentes
    expect(resultado.alsoUpdatedIds.sort()).toEqual(['t2', 't3']);
    expect(ctx.transacoes.transactions.find((t) => t.id === 't2')?.categoryId).toBe('cat-food');
    expect(ctx.transacoes.transactions.find((t) => t.id === 't4')?.categoryId).toBeNull();
  });

  it('a regra aprendida vence as do sistema, mas não as de transferência', async () => {
    await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-food',
      remember: true,
    });

    const regra = ctx.regras.rules[0]!;
    expect(regra.source).toBe('learned');
    expect(regra.priority).toBeGreaterThan(1);
    expect(regra.priority).toBeLessThan(10);
  });

  it('corrigir de novo reaponta a mesma regra em vez de criar outra', async () => {
    const entrada = { userId: USER_ID, transactionId: 't1', remember: true };

    await ctx.useCase.execute({ ...entrada, categoryId: 'cat-food' });
    await ctx.useCase.execute({ ...entrada, categoryId: 'cat-market' });

    expect(ctx.regras.rules).toHaveLength(1);
    expect(ctx.regras.rules[0]?.categoryId).toBe('cat-market');
  });

  it('não sobrescreve escolha manual anterior de outra transação', async () => {
    const manual = tx('t2', 'Ifood *Outro Lugar').categorize('cat-market', 'manual');
    ctx = setup([tx('t1', 'Ifood *Restaurante Sabor'), manual]);

    const resultado = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-food',
      remember: true,
    });

    expect(resultado.alsoUpdatedIds).toEqual([]);
    expect(ctx.transacoes.transactions.find((t) => t.id === 't2')?.categoryId).toBe('cat-market');
  });

  it('categoria de transferência tira a transação dos totais', async () => {
    const { transaction } = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: 'cat-transfer',
    });

    expect(transaction.isTransfer).toBe(true);
    expect(transaction.countsAsExpense).toBe(false);
  });

  it('sair de transferência devolve a transação aos totais', async () => {
    const entrada = { userId: USER_ID, transactionId: 't1' };
    await ctx.useCase.execute({ ...entrada, categoryId: 'cat-transfer' });

    const { transaction } = await ctx.useCase.execute({ ...entrada, categoryId: 'cat-food' });

    expect(transaction.isTransfer).toBe(false);
    expect(transaction.countsAsExpense).toBe(true);
  });

  it('remove a categoria quando recebe null', async () => {
    await ctx.useCase.execute({ userId: USER_ID, transactionId: 't1', categoryId: 'cat-food' });

    const { transaction } = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      categoryId: null,
    });

    expect(transaction.categoryId).toBeNull();
    expect(transaction.categorizedBy).toBe('uncategorized');
  });

  it('não aprende com descrição curta demais, que casaria com meio extrato', async () => {
    ctx = setup([tx('t9', 'AB')]);

    const resultado = await ctx.useCase.execute({
      userId: USER_ID,
      transactionId: 't9',
      categoryId: 'cat-food',
      remember: true,
    });

    expect(resultado.learnedPattern).toBeNull();
    expect(ctx.regras.rules).toHaveLength(0);
  });

  it('recusa transação inexistente', async () => {
    await expect(
      ctx.useCase.execute({ userId: USER_ID, transactionId: 'nao-existe', categoryId: 'cat-food' }),
    ).rejects.toThrow(/não encontrad/i);
  });
});
