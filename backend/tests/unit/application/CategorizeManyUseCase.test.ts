import { describe, expect, it } from 'vitest';
import { CategorizeManyUseCase } from '../../../src/application/use-cases/transactions/CategorizeManyUseCase.js';
import { Category } from '../../../src/domain/entities/Category.js';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import {
  InMemoryCategoryRepository,
  InMemoryTransactionRepository,
  USER_ID,
} from '../../doubles/InMemoryRepositories.js';

function tx(id: string) {
  return Transaction.create({
    id,
    userId: USER_ID,
    accountId: 'acc-1',
    occurredOn: '2026-09-04',
    description: `compra ${id}`,
    amount: Money.fromCents(-1000),
  });
}

function categoria(id: string, kind: 'expense' | 'transfer') {
  return new Category({
    id,
    userId: USER_ID,
    name: kind === 'transfer' ? 'Transferências' : 'Lazer',
    kind,
    color: null,
    icon: null,
    isSystem: true,
  });
}

describe('CategorizeManyUseCase', () => {
  it('aplica a categoria só nas selecionadas, como escolha manual', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1'), tx('t2'), tx('t3')]);
    const useCase = new CategorizeManyUseCase(
      repo,
      new InMemoryCategoryRepository([categoria('c1', 'expense')]),
    );

    const { affected } = await useCase.execute({
      userId: USER_ID,
      transactionIds: ['t1', 't3'],
      categoryId: 'c1',
    });

    expect(affected).toBe(2);
    const porId = new Map(repo.transactions.map((t) => [t.id, t]));
    expect(porId.get('t1')?.categoryId).toBe('c1');
    expect(porId.get('t3')?.categoryId).toBe('c1');
    expect(porId.get('t2')?.categoryId).toBeNull();
    // manual, e não `rule`: uma regra futura não pode desfazer a escolha
    expect(porId.get('t1')?.categorizedBy).toBe('manual');
  });

  it('categoria de transferência tira as selecionadas dos totais', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1')]);
    const useCase = new CategorizeManyUseCase(
      repo,
      new InMemoryCategoryRepository([categoria('c9', 'transfer')]),
    );

    await useCase.execute({ userId: USER_ID, transactionIds: ['t1'], categoryId: 'c9' });

    expect(repo.transactions[0]?.isTransfer).toBe(true);
  });

  it('recusa seleção vazia e categoria inexistente', async () => {
    const useCase = new CategorizeManyUseCase(
      new InMemoryTransactionRepository([tx('t1')]),
      new InMemoryCategoryRepository([]),
    );

    await expect(
      useCase.execute({ userId: USER_ID, transactionIds: [], categoryId: 'c1' }),
    ).rejects.toThrow(/selecionada/i);

    await expect(
      useCase.execute({ userId: USER_ID, transactionIds: ['t1'], categoryId: 'c1' }),
    ).rejects.toThrow(/não encontrad/i);
  });
});
