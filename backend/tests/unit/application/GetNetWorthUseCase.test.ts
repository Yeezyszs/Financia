import { describe, expect, it } from 'vitest';
import { GetNetWorthUseCase } from '../../../src/application/use-cases/reports/GetNetWorthUseCase.js';
import { Transaction } from '../../../src/domain/entities/Transaction.js';
import { Money } from '../../../src/domain/value-objects/Money.js';
import {
  InMemoryAccountBalanceRepository,
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryTransactionRepository,
  USER_ID,
  makeCard,
  makeCategory,
  makeChecking,
} from '../../doubles/InMemoryRepositories.js';

function tx(id: string, accountId: string, occurredOn: string, cents: number, isTransfer = false) {
  const base = Transaction.create({
    id,
    userId: USER_ID,
    accountId,
    occurredOn,
    description: `mov ${id}`,
    amount: Money.fromCents(cents),
  });
  return isTransfer ? base.markAsTransfer() : base;
}

function montar(transacoes: Transaction[], ancoras: { onDate: string; balanceCents: number }[]) {
  return new GetNetWorthUseCase(
    new InMemoryAccountRepository([makeChecking(), makeCard()]),
    new InMemoryAccountBalanceRepository(
      ancoras.map((a) => ({ accountId: 'acc-checking', source: 'manual' as const, ...a })),
    ),
    new InMemoryTransactionRepository(transacoes),
    new InMemoryCategoryRepository([makeCategory('cat-food', 'Alimentação', 'expense')]),
  );
}

const JANELA = { from: '2026-04-01', to: '2026-09-30' };

describe('GetNetWorthUseCase', () => {
  it('soma o movimento posterior à âncora e desconta a fatura em aberto', async () => {
    const useCase = montar(
      [
        tx('t1', 'acc-checking', '2026-09-02', -50000),
        tx('t2', 'acc-card', '2026-09-03', -30000),
        tx('t3', 'acc-card', '2026-08-15', -99900), // antes do pagamento: já quitada
        tx('t4', 'acc-card', '2026-09-01', 99900, true), // pagamento da fatura
      ],
      [{ onDate: '2026-08-31', balanceCents: 500000 }],
    );

    const resultado = await useCase.execute({ userId: USER_ID, ...JANELA });

    expect(resultado.cashCents).toBe(450000);
    expect(resultado.cardDebtCents).toBe(30000);
    expect(resultado.netWorthCents).toBe(420000);
  });

  it('conta corrente sem saldo informado não entra no caixa, e é sinalizada', async () => {
    const useCase = montar([tx('t1', 'acc-checking', '2026-09-02', -50000)], []);

    const resultado = await useCase.execute({ userId: USER_ID, ...JANELA });

    expect(resultado.cashCents).toBe(0);
    expect(resultado.accountsMissingBalance).toBe(1);
    expect(resultado.monthsOfRunway).toBeNull();
    expect(resultado.accounts.find((a) => a.type === 'checking')?.known).toBe(false);
  });

  it('mede a reserva em meses de custo de vida', async () => {
    // 2 meses com R$ 500 de consumo cada: custo de vida R$ 500/mês.
    const useCase = montar(
      [
        tx('t1', 'acc-checking', '2026-08-10', -50000),
        tx('t2', 'acc-checking', '2026-09-10', -50000),
      ],
      [{ onDate: '2026-07-31', balanceCents: 250000 }],
    );

    const resultado = await useCase.execute({ userId: USER_ID, ...JANELA });

    expect(resultado.costOfLivingCents).toBe(50000);
    // 250.000 − 100.000 de movimento = 150.000 de caixa → 3 meses
    expect(resultado.netWorthCents).toBe(150000);
    expect(resultado.monthsOfRunway).toBe(3);
  });
});
