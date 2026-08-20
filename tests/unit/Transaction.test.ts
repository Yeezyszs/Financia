import { describe, expect, it } from 'vitest';
import { Money } from '../../src/domain/entities/Money.js';
import { Transaction } from '../../src/domain/entities/Transaction.js';

const base = {
  id: 't1',
  ownerId: 'pedro',
  accountId: 'acc1',
  merchant: 'IFOOD',
  occurredAt: new Date('2026-08-20T12:00:00Z'),
};

describe('Transaction', () => {
  it('nasce pendente quando nao tem categoria', () => {
    const t = new Transaction({ ...base, amount: Money.fromCents(5000) });
    expect(t.status).toBe('pendente');
  });

  it('nasce categorizada quando ja recebe categoria', () => {
    const t = new Transaction({ ...base, amount: Money.fromCents(5000), categoryId: 'cat1' });
    expect(t.status).toBe('categorizada');
  });

  it('exige sinal coerente com o tipo', () => {
    expect(() => new Transaction({ ...base, amount: Money.fromCents(-5000) })).toThrow(/positivo/);
    expect(() => new Transaction({ ...base, amount: Money.fromCents(5000), kind: 'refund' })).toThrow(/negativo/);
  });

  it('categorizedAs devolve nova instancia sem mutar a original', () => {
    const original = new Transaction({ ...base, amount: Money.fromCents(5000) });
    const updated = original.categorizedAs('cat1');

    expect(updated.categoryId).toBe('cat1');
    expect(updated.status).toBe('categorizada');
    expect(original.categoryId).toBeNull();
    expect(original.status).toBe('pendente');
  });

  it('nao concilia transacao ainda pendente', () => {
    const t = new Transaction({ ...base, amount: Money.fromCents(5000) });
    expect(() => t.reconciled()).toThrow(/sem categoria/);
  });
});
