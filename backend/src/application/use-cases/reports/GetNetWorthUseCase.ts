import { faturaEmAberto, saldoDaConta } from '../../../domain/analysis/AccountPosition.js';
import type { AccountBalanceRepository } from '../../ports/repositories/AccountBalanceRepository.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

export interface AccountPosition {
  accountId: string;
  name: string;
  type: 'checking' | 'credit_card';
  /** Conta corrente: saldo. Cartão: fatura em aberto, positiva. */
  amountCents: number;
  /**
   * Conta corrente: data da âncora que originou o saldo. Cartão: data do
   * último pagamento reconhecido. `null` quando não há nem uma nem outro
   * — e aí o número da conta corrente não vale nada.
   */
  asOf: string | null;
  /** Só conta corrente: falso enquanto ninguém informou saldo nenhum. */
  known: boolean;
}

export interface NetWorthOutput {
  accounts: AccountPosition[];
  /** Soma das contas correntes com saldo conhecido. */
  cashCents: number;
  /** Soma das faturas em aberto. Positiva: é dívida. */
  cardDebtCents: number;
  /** Caixa menos dívida de cartão. */
  netWorthCents: number;
  /** Média mensal de consumo na janela — a régua da reserva. */
  costOfLivingCents: number;
  /**
   * Quantos meses o patrimônio líquido cobre. `null` sem saldo informado
   * ou sem custo de vida: dividir por zero e mostrar "∞ meses" seria
   * pior que não mostrar nada.
   */
  monthsOfRunway: number | null;
  /** Contas correntes que ainda não têm saldo informado. */
  accountsMissingBalance: number;
}

/**
 * Patrimônio líquido: o que se tem menos o que já se deve.
 *
 * O app só sabia fluxo — quanto entrou e saiu. Fluxo não responde "dá
 * para ficar quantos meses sem renda", que é a pergunta que decide se um
 * gasto grande cabe ou não. Isso exige estoque, e estoque exige alguém
 * dizer o saldo de algum dia: extrato de CSV não traz o de hoje.
 */
export class GetNetWorthUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly balances: AccountBalanceRepository,
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    /** Início da janela usada para medir o custo de vida (YYYY-MM-DD). */
    from: string;
    to: string;
  }): Promise<NetWorthOutput> {
    const [accounts, anchors, movements, series, categoryList] = await Promise.all([
      this.accounts.listByUser(input.userId),
      this.balances.latestByAccount(input.userId),
      this.transactions.listMovements(input.userId),
      this.transactions.categorySeries(input.userId, input.from, input.to),
      this.categories.listByUser(input.userId),
    ]);

    const porConta = new Map<string, typeof movements>();
    for (const movimento of movements) {
      const lista = porConta.get(movimento.accountId);
      if (lista) lista.push(movimento);
      else porConta.set(movimento.accountId, [movimento]);
    }

    const positions: AccountPosition[] = [];
    let cashCents = 0;
    let cardDebtCents = 0;
    let accountsMissingBalance = 0;

    for (const account of accounts) {
      const movimentos = porConta.get(account.id) ?? [];

      if (account.type === 'credit_card') {
        const fatura = faturaEmAberto(movimentos);
        cardDebtCents += fatura.amountCents;
        positions.push({
          accountId: account.id,
          name: account.name,
          type: 'credit_card',
          amountCents: fatura.amountCents,
          asOf: fatura.sinceDate,
          known: true,
        });
        continue;
      }

      const ancora = anchors.get(account.id) ?? null;
      const saldo = saldoDaConta(ancora, movimentos);
      if (ancora) cashCents += saldo.balanceCents;
      else accountsMissingBalance += 1;

      positions.push({
        accountId: account.id,
        name: account.name,
        type: 'checking',
        amountCents: saldo.balanceCents,
        asOf: saldo.asOf,
        known: ancora !== null,
      });
    }

    // Custo de vida é consumo: aporte fica de fora, como no resto do app.
    const aporte = new Set(categoryList.filter((c) => c.isSaving).map((c) => c.id));
    const consumo = series.filter((p) => !p.categoryId || !aporte.has(p.categoryId));
    const meses = new Set(consumo.map((p) => p.month)).size || 1;
    const costOfLivingCents = Math.round(
      consumo.reduce((soma, p) => soma + p.expenseCents, 0) / meses,
    );

    const netWorthCents = cashCents - cardDebtCents;
    const temSaldo = accounts.some((a) => a.type === 'checking') && anchors.size > 0;

    return {
      accounts: positions,
      cashCents,
      cardDebtCents,
      netWorthCents,
      costOfLivingCents,
      monthsOfRunway:
        temSaldo && costOfLivingCents > 0
          ? Math.round((netWorthCents / costOfLivingCents) * 10) / 10
          : null,
      accountsMissingBalance,
    };
  }
}
