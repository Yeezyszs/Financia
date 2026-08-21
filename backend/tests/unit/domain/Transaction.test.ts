import { describe, expect, it } from 'vitest';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';

function make(amountCents: number) {
  return Transaction.create({
    id: 'tx-1',
    userId: 'user-1',
    accountId: 'acc-1',
    occurredOn: '2026-08-10',
    description: 'Pagamento de fatura',
    amount: Money.fromCents(amountCents),
  });
}

describe('Transaction', () => {
  it('conta saída como despesa e entrada como receita', () => {
    expect(make(-5000).countsAsExpense).toBe(true);
    expect(make(5000).countsAsIncome).toBe(true);
  });

  it('transferência não entra em receita nem despesa', () => {
    const transfer = make(-5000).markAsTransfer('tx-2');
    expect(transfer.countsAsExpense).toBe(false);
    expect(transfer.counterpartTransactionId).toBe('tx-2');
  });

  it('categorização guarda a origem', () => {
    const categorized = make(-5000).categorize('cat-1', 'rule', 'rule-1');
    expect(categorized.categoryId).toBe('cat-1');
    expect(categorized.categorizedBy).toBe('rule');
    expect(categorized.appliedRuleId).toBe('rule-1');
  });

  it('recusa data inválida e valor zero', () => {
    expect(() =>
      Transaction.create({
        id: 'x',
        userId: 'u',
        accountId: 'a',
        occurredOn: '10/08/2026',
        description: 'x',
        amount: Money.fromCents(1),
      }),
    ).toThrow();
    expect(() => make(0)).toThrow();
  });
});
