import { describe, expect, it } from 'vitest';
import { UpdateTransactionUseCase } from '../../../src/application/use-cases/transactions/UpdateTransactionUseCase.js';
import { FlipImportSignsUseCase } from '../../../src/application/use-cases/imports/FlipImportSignsUseCase.js';
import { DeleteImportUseCase } from '../../../src/application/use-cases/imports/DeleteImportUseCase.js';
import { Import } from '../../../src/domain/entities/Import.js';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import {
  InMemoryImportRepository,
  InMemoryTransactionRepository,
  USER_ID,
} from '../../doubles/InMemoryRepositories.js';

function tx(id: string, amountCents: number, importId: string | null = null) {
  return Transaction.create({
    id,
    userId: USER_ID,
    accountId: 'acc-1',
    occurredOn: '2026-09-04',
    description: 'Apple.Com/Bill',
    amount: Money.fromCents(amountCents),
    ...(importId ? { importId } : {}),
  });
}

function importacao(id: string, status: 'completed' | 'failed' = 'completed') {
  return new Import({
    id,
    userId: USER_ID,
    accountId: 'acc-1',
    filename: 'c6-fatura.csv',
    fileHash: 'hash',
    status,
    rowsTotal: 3,
    rowsImported: 3,
    rowsDuplicated: 0,
    periodStart: '2026-09-01',
    periodEnd: '2026-09-04',
    errorMessage: null,
    createdAt: new Date(),
    completedAt: new Date(),
  });
}

describe('UpdateTransactionUseCase', () => {
  it('vira receita em despesa invertendo o valor', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1', 2499)]);
    const useCase = new UpdateTransactionUseCase(repo);

    const atualizada = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      direction: 'expense',
    });

    expect(atualizada.amount.cents).toBe(-2499);
    expect(atualizada.countsAsExpense).toBe(true);
  });

  it('preserva o fingerprint ao inverter, para a reimportação não duplicar', async () => {
    const original = tx('t1', 2499);
    const repo = new InMemoryTransactionRepository([original]);
    const useCase = new UpdateTransactionUseCase(repo);

    const atualizada = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      direction: 'expense',
    });

    expect(atualizada.fingerprint).toBe(original.fingerprint);
  });

  it('não mexe no valor quando já está na direção pedida', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1', -2499)]);
    const useCase = new UpdateTransactionUseCase(repo);

    const atualizada = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      direction: 'expense',
    });

    expect(atualizada.amount.cents).toBe(-2499);
  });

  it('tira e devolve a transação aos totais', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1', -2499)]);
    const useCase = new UpdateTransactionUseCase(repo);

    const fora = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      isTransfer: true,
    });
    expect(fora.countsAsExpense).toBe(false);

    const dentro = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      isTransfer: false,
    });
    expect(dentro.countsAsExpense).toBe(true);
  });

  it('guarda e apaga a observação', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1', -2499)]);
    const useCase = new UpdateTransactionUseCase(repo);

    const anotada = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      notes: '  assinatura do iCloud  ',
    });
    expect(anotada.notes).toBe('assinatura do iCloud');

    const limpa = await useCase.execute({ userId: USER_ID, transactionId: 't1', notes: null });
    expect(limpa.notes).toBeNull();
  });

  it('observação em branco vira nulo, não anotação vazia', async () => {
    const repo = new InMemoryTransactionRepository([tx('t1', -2499)]);
    const useCase = new UpdateTransactionUseCase(repo);

    const atualizada = await useCase.execute({
      userId: USER_ID,
      transactionId: 't1',
      notes: '   ',
    });

    expect(atualizada.notes).toBeNull();
  });

  it('recusa transação inexistente', async () => {
    const useCase = new UpdateTransactionUseCase(new InMemoryTransactionRepository([]));

    await expect(
      useCase.execute({ userId: USER_ID, transactionId: 'x', direction: 'expense' }),
    ).rejects.toThrow(/não encontrad/i);
  });
});

describe('FlipImportSignsUseCase', () => {
  it('inverte a importação inteira de uma vez', async () => {
    const transacoes = new InMemoryTransactionRepository([
      tx('t1', 2499, 'imp-1'),
      tx('t2', 7490, 'imp-1'),
      tx('t3', -12000, 'imp-2'),
    ]);
    const useCase = new FlipImportSignsUseCase(
      new InMemoryImportRepository([importacao('imp-1')]),
      transacoes,
    );

    const { affected } = await useCase.execute({ userId: USER_ID, importId: 'imp-1' });

    expect(affected).toBe(2);
    expect(transacoes.transactions.find((t) => t.id === 't1')?.amount.cents).toBe(-2499);
    expect(transacoes.transactions.find((t) => t.id === 't2')?.amount.cents).toBe(-7490);
    // a de outra importação não é tocada
    expect(transacoes.transactions.find((t) => t.id === 't3')?.amount.cents).toBe(-12000);
  });

  it('recusa importação que não terminou', async () => {
    const useCase = new FlipImportSignsUseCase(
      new InMemoryImportRepository([importacao('imp-1', 'failed')]),
      new InMemoryTransactionRepository([]),
    );

    await expect(useCase.execute({ userId: USER_ID, importId: 'imp-1' })).rejects.toThrow(
      /concluída/i,
    );
  });
});

describe('DeleteImportUseCase', () => {
  it('apaga as transações da importação e o registro dela', async () => {
    const transacoes = new InMemoryTransactionRepository([
      tx('t1', 2499, 'imp-1'),
      tx('t2', 7490, 'imp-1'),
      tx('t3', -12000, 'imp-2'),
    ]);
    const importacoes = new InMemoryImportRepository([importacao('imp-1'), importacao('imp-2')]);
    const useCase = new DeleteImportUseCase(importacoes, transacoes);

    const { deletedTransactions } = await useCase.execute({ userId: USER_ID, importId: 'imp-1' });

    expect(deletedTransactions).toBe(2);
    expect(transacoes.transactions.map((t) => t.id)).toEqual(['t3']);
    expect(importacoes.records.map((r) => r.id)).toEqual(['imp-2']);
  });

  it('apaga também a importação que falhou, sem transação nenhuma', async () => {
    const importacoes = new InMemoryImportRepository([importacao('imp-1', 'failed')]);
    const useCase = new DeleteImportUseCase(importacoes, new InMemoryTransactionRepository([]));

    const { deletedTransactions } = await useCase.execute({ userId: USER_ID, importId: 'imp-1' });

    expect(deletedTransactions).toBe(0);
    expect(importacoes.records).toHaveLength(0);
  });

  it('recusa importação inexistente', async () => {
    const useCase = new DeleteImportUseCase(
      new InMemoryImportRepository([]),
      new InMemoryTransactionRepository([]),
    );

    await expect(useCase.execute({ userId: USER_ID, importId: 'x' })).rejects.toThrow(
      /não encontrad/i,
    );
  });
});
