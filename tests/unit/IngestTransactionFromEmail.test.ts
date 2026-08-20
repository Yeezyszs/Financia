import { describe, expect, it } from 'vitest';
import { CategorizeTransaction } from '../../src/application/use-cases/CategorizeTransaction';
import { IngestTransactionFromEmail } from '../../src/application/use-cases/IngestTransactionFromEmail';
import { InMemoryParserRegistry } from '../../src/infrastructure/gateways/email/InMemoryParserRegistry';
import { EmailSource } from '../../src/domain/entities/EmailSource';
import { Money } from '../../src/domain/entities/Money';
import { Category } from '../../src/domain/entities/Category';
import type { EmailParser, RawEmail } from '../../src/application/ports/EmailParser';
import { FakeCategoryRepository, FakeTransactionRepository, category, sequentialIds } from '../fakes';

/** Parser de mentira: prova que o use case funciona sem depender de banco real. */
const fakeParser: EmailParser = {
  institution: 'banco_teste',
  canParse: (email) => email.subject.includes('Compra') || email.subject.includes('Estorno'),
  parse: (email) => {
    const isRefund = email.subject.includes('Estorno');
    const amount = Money.fromBRLString('89,90');
    return {
      amount: isRefund ? amount.negated() : amount,
      merchant: 'IFOOD',
      occurredAt: email.receivedAt,
      kind: isRefund ? 'refund' : 'purchase',
    };
  },
};

const source = new EmailSource({
  id: 'src-1',
  ownerId: 'pedro',
  accountId: 'acc-1',
  institution: 'Banco Teste',
  parserStrategy: 'banco_teste',
  fromAddresses: ['noreply@bancoteste.com.br'],
});

function email(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    id: 'gmail-msg-1',
    from: 'Banco Teste <noreply@bancoteste.com.br>',
    subject: 'Compra aprovada no seu cartao',
    receivedAt: new Date('2026-08-20T18:30:00Z'),
    body: 'Compra de R$ 89,90 em IFOOD',
    ...overrides,
  };
}

function buildUseCase() {
  const transactions = new FakeTransactionRepository();
  const categories = new FakeCategoryRepository([
    new Category({ id: 'cat-0', ownerId: 'pedro', name: 'Nao categorizado' }),
    category('cat-1', 'Alimentacao', ['IFOOD']),
  ]);
  const useCase = new IngestTransactionFromEmail(
    new InMemoryParserRegistry([fakeParser]),
    transactions,
    new CategorizeTransaction(categories),
    sequentialIds('tx'),
  );
  return { useCase, transactions };
}

describe('IngestTransactionFromEmail', () => {
  it('ingere e ja categoriza a transacao', async () => {
    const { useCase, transactions } = buildUseCase();

    const outcome = await useCase.execute(email(), source);

    expect(outcome.status).toBe('ingested');
    expect(transactions.rows).toHaveLength(1);
    expect(transactions.rows[0]?.amount.cents).toBe(8990);
    expect(transactions.rows[0]?.categoryId).toBe('cat-1');
    expect(transactions.rows[0]?.accountId).toBe('acc-1');
    expect(transactions.rows[0]?.status).toBe('categorizada');
  });

  it('o mesmo e-mail lido duas vezes nao duplica', async () => {
    const { useCase, transactions } = buildUseCase();

    await useCase.execute(email(), source);
    const second = await useCase.execute(email(), source);

    expect(second.status).toBe('duplicate');
    expect(transactions.rows).toHaveLength(1);
  });

  it('ignora e-mail do mesmo banco que nao e transacao', async () => {
    const { useCase, transactions } = buildUseCase();

    const outcome = await useCase.execute(email({ id: 'x', subject: 'Sua fatura fechou' }), source);

    expect(outcome.status).toBe('not_a_transaction');
    expect(transactions.rows).toHaveLength(0);
  });

  it('rejeita remetente fora da allowlist da fonte', async () => {
    const { useCase, transactions } = buildUseCase();

    const outcome = await useCase.execute(email({ id: 'y', from: 'phishing@bancoteste.evil.com' }), source);

    expect(outcome.status).toBe('rejected_sender');
    expect(transactions.rows).toHaveLength(0);
  });

  it('estorno entra como transacao negativa ligada a compra original', async () => {
    const { useCase, transactions } = buildUseCase();

    await useCase.execute(email(), source);
    await useCase.execute(email({ id: 'gmail-msg-2', subject: 'Estorno de compra' }), source);

    expect(transactions.rows).toHaveLength(2);
    expect(transactions.rows[1]?.amount.cents).toBe(-8990);
    expect(transactions.rows[1]?.reversalOfId).toBe(transactions.rows[0]?.id);
    // O total liquido volta a zero, e a compra original continua no historico.
    expect(transactions.rows.reduce((s, t) => s + t.amount.cents, 0)).toBe(0);
  });
});
