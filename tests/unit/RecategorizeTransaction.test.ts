import { describe, expect, it } from 'vitest';
import { RecategorizeTransaction } from '../../src/application/use-cases/RecategorizeTransaction.js';
import { CategorizeTransaction } from '../../src/application/use-cases/CategorizeTransaction.js';
import { Category } from '../../src/domain/entities/Category.js';
import { Money } from '../../src/domain/entities/Money.js';
import { Transaction } from '../../src/domain/entities/Transaction.js';
import { FakeCategoryRepository, FakeTransactionRepository, category } from '../fakes.js';

describe('RecategorizeTransaction', () => {
  it('corrige a transacao e aprende a regra para a proxima vez', async () => {
    const transactions = new FakeTransactionRepository();
    const categories = new FakeCategoryRepository([
      new Category({ id: 'cat-0', ownerId: 'pedro', name: 'Nao categorizado' }),
      category('cat-1', 'Alimentacao', []),
    ]);

    await transactions.createIfAbsent(
      new Transaction({
        id: 't1',
        ownerId: 'pedro',
        accountId: 'acc-1',
        amount: Money.fromCents(4500),
        merchant: 'Padaria Sao Joao',
        occurredAt: new Date('2026-08-20T12:00:00Z'),
        categoryId: 'cat-0',
      }),
    );

    const useCase = new RecategorizeTransaction(transactions, categories);
    const updated = await useCase.execute({ transactionId: 't1', categoryId: 'cat-1' });

    expect(updated.categoryId).toBe('cat-1');

    // A prova de que aprendeu: a mesma padaria agora categoriza sozinha.
    const auto = await new CategorizeTransaction(categories).execute({
      ownerId: 'pedro',
      merchant: 'PADARIA SAO JOAO UNIDADE 2',
    });
    expect(auto).toEqual({ categoryId: 'cat-1', matched: true });
  });

  it('nao aprende regra a partir do fallback', async () => {
    const transactions = new FakeTransactionRepository();
    const fallback = new Category({ id: 'cat-0', ownerId: 'pedro', name: 'Nao categorizado' });
    const categories = new FakeCategoryRepository([fallback, category('cat-1', 'Alimentacao', [])]);

    await transactions.createIfAbsent(
      new Transaction({
        id: 't1',
        ownerId: 'pedro',
        accountId: 'acc-1',
        amount: Money.fromCents(4500),
        merchant: 'Qualquer Coisa',
        occurredAt: new Date('2026-08-20T12:00:00Z'),
        categoryId: 'cat-1',
      }),
    );

    await new RecategorizeTransaction(transactions, categories).execute({
      transactionId: 't1',
      categoryId: 'cat-0',
    });

    expect(fallback.rules).toHaveLength(0);
  });
});
