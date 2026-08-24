import { describe, expect, it } from 'vitest';
import { snapshotToMarkdown } from '../../../src/interface-adapters/presenters/SnapshotMarkdownPresenter.js';
import type {
  FinancialSnapshot,
  RecurringItem,
} from '../../../src/application/use-cases/insights/GetFinancialSnapshotUseCase.js';

function assinatura(label: string, typicalCents: number, lastSeen: string): RecurringItem {
  return {
    key: label.toLowerCase(),
    label,
    kind: 'subscription',
    occurrences: 6,
    monthsSeen: 6,
    typicalCents,
    monthlyAverageCents: typicalCents,
    firstSeen: '2026-03-05',
    lastSeen,
    categoryId: 'c1',
    categoryName: 'Assinaturas',
  };
}

const base: FinancialSnapshot = {
  period: { from: '2026-03-01', to: '2026-08-31', referenceMonth: '2026-08' },
  months: 6,
  income: { totalCents: 7600000, monthlyAverageCents: 1266667 },
  expense: { totalCents: 5320000, monthlyAverageCents: 886667 },
  fixedMonthlyCents: 34876,
  variableMonthlyCents: 851791,
  monthlySeries: [
    { month: '2026-07', incomeCents: 1250000, expenseCents: 794500 },
    { month: '2026-08', incomeCents: 1250000, expenseCents: 837445 },
  ],
  subscriptions: [assinatura('Netflix.com', 5590, '2026-08-05')],
  recurring: [],
  trends: [
    {
      categoryId: 'c2',
      name: 'Alimentação',
      currentCents: 128790,
      averageCents: 89000,
      changePercent: 45,
      series: [],
    },
  ],
  topMerchants: [],
  transactionCount: 743,
};

describe('snapshotToMarkdown', () => {
  it('abre com o mês por extenso e o contexto de leitura', () => {
    const texto = snapshotToMarkdown(base);

    expect(texto).toContain('# Resumo financeiro — agosto/2026');
    expect(texto).toContain('743 transações');
    // sem esse aviso o assistente pode contar pagamento de fatura como despesa
    expect(texto).toContain('pagamento da fatura');
  });

  it('formata valores em reais, não em centavos', () => {
    const texto = snapshotToMarkdown(base);

    expect(texto).toContain('R$ 12.500,00');
    expect(texto).toContain('R$ 8.374,45');
    expect(texto).not.toContain('1250000');
  });

  it('traz saldo do mês de referência', () => {
    const texto = snapshotToMarkdown(base);
    expect(texto).toContain('Saldo: R$ 4.125,55');
  });

  it('lista assinatura ativa e omite a que parou antes do mês', () => {
    const texto = snapshotToMarkdown({
      ...base,
      subscriptions: [
        assinatura('Netflix.com', 5590, '2026-08-05'),
        assinatura('Revista Antiga', 3000, '2026-04-05'),
      ],
    });

    expect(texto).toContain('Netflix.com');
    expect(texto).not.toContain('Revista Antiga');
    expect(texto).toContain('Assinaturas ativas (1)');
  });

  it('marca variação sem base como travessão em vez de porcentagem', () => {
    const texto = snapshotToMarkdown({
      ...base,
      trends: [
        {
          categoryId: 'c3',
          name: 'Saúde',
          currentCents: 50000,
          averageCents: 0,
          changePercent: 0,
          series: [],
        },
      ],
    });

    expect(texto).toContain('| Saúde | R$ 500,00 | R$ 0,00 | — |');
  });

  it('aguenta um retrato vazio sem quebrar', () => {
    const vazio: FinancialSnapshot = {
      ...base,
      monthlySeries: [],
      subscriptions: [],
      recurring: [],
      trends: [],
      transactionCount: 0,
    };

    const texto = snapshotToMarkdown(vazio);

    expect(texto).toContain('Sem movimento registrado neste mês.');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('NaN');
  });
});
