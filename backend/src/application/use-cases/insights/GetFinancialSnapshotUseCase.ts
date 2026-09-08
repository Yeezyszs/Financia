import {
  detectRecurring,
  type RecurringGroup,
} from '../../../domain/analysis/RecurringDetector.js';
import type { CategoryRepository } from '../../ports/repositories/CategoryRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

export interface CategoryTrend {
  categoryId: string | null;
  name: string;
  /** Gasto no mês de referência. */
  currentCents: number;
  /** Média dos meses anteriores da janela, excluindo o mês de referência. */
  averageCents: number;
  /** Variação percentual contra a média. Positivo = gastou mais. */
  changePercent: number;
  /** Série mensal, do mais antigo ao mais recente. */
  series: { month: string; expenseCents: number }[];
}

export interface RecurringItem extends RecurringGroup {
  categoryName: string | null;
}

export interface FinancialSnapshot {
  period: { from: string; to: string; referenceMonth: string };
  months: number;
  income: { totalCents: number; monthlyAverageCents: number };
  expense: { totalCents: number; monthlyAverageCents: number };
  /** Aporte líquido no período. Fora da despesa: guardar não é gastar. */
  saving: { totalCents: number; monthlyAverageCents: number };
  /** Fatia da renda que não virou consumo. `null` sem receita no período. */
  savingRatePercent: number | null;
  /**
   * O que a janela escolhida permite responder. Uma janela de um mês dá
   * totais, mas não comparação (a média seria o próprio mês) nem
   * recorrência (que exige ver a mesma coisa se repetir). Dizer isso é
   * diferente de devolver lista vazia: vazio parece "não achei nada",
   * quando na verdade é "não dá para procurar".
   */
  canCompare: boolean;
  canDetectRecurrence: boolean;
  /** Soma mensal das assinaturas — o gasto que existe mesmo parado. */
  fixedMonthlyCents: number;
  variableMonthlyCents: number;
  /** Receita e despesa por mês da janela, do mais antigo ao mais recente. */
  monthlySeries: { month: string; incomeCents: number; expenseCents: number }[];
  subscriptions: RecurringItem[];
  recurring: RecurringItem[];
  trends: CategoryTrend[];
  topMerchants: { label: string; totalCents: number; count: number }[];
  transactionCount: number;
}

/** Primeiro dia do mês N meses antes de uma referência YYYY-MM. */
function monthsBefore(referenceMonth: string, months: number): string {
  const year = Number(referenceMonth.slice(0, 4));
  const month = Number(referenceMonth.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 - months, 1));
  return date.toISOString().slice(0, 10);
}

function lastDayOf(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

/**
 * O retrato que alimenta tanto a tela quanto, na fase seguinte, o
 * consultor. Ele existe separado do consultor de propósito: tudo aqui é
 * cálculo determinístico e verificável, sem IA envolvida. Se o número
 * estiver errado, o erro está em código testável — não numa resposta de
 * modelo.
 */
export class GetFinancialSnapshotUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    /** Mês de referência YYYY-MM. */
    referenceMonth: string;
    /** Tamanho da janela analisada, em meses. */
    months?: number;
  }): Promise<FinancialSnapshot> {
    const months = input.months ?? 6;
    const from = monthsBefore(input.referenceMonth, months - 1);
    const to = lastDayOf(input.referenceMonth);

    const [series, rawTransactions, categoryList] = await Promise.all([
      this.transactions.categorySeries(input.userId, from, to),
      this.transactions.listForAnalysis(input.userId, from, to),
      this.categories.listByUser(input.userId),
    ]);

    const categoryName = new Map(categoryList.map((c) => [c.id, c.name]));
    const nomeDe = (id: string | null) => (id ? (categoryName.get(id) ?? null) : null);

    // Aporte sai de toda a análise de gasto: ele não é consumo, não é
    // assinatura a cancelar e não é hábito a reduzir. Deixá-lo dentro
    // faria a compra mensal de um título aparecer como o maior "gasto
    // fixo" da pessoa.
    const aporte = new Set(categoryList.filter((c) => c.isSaving).map((c) => c.id));
    const semAporte = series.filter((ponto) => !ponto.categoryId || !aporte.has(ponto.categoryId));
    const gastoAnalisavel = rawTransactions.filter(
      (t) => !t.categoryId || !aporte.has(t.categoryId),
    );

    // ---- totais da janela
    const totalIncome = semAporte.reduce((soma, ponto) => soma + ponto.incomeCents, 0);
    const totalExpense = semAporte.reduce((soma, ponto) => soma + ponto.expenseCents, 0);
    const totalSaving = series
      .filter((ponto) => ponto.categoryId && aporte.has(ponto.categoryId))
      .reduce((soma, ponto) => soma + ponto.expenseCents - ponto.incomeCents, 0);
    const mesesComDados = new Set(series.map((ponto) => ponto.month)).size || 1;

    // ---- série mensal consolidada (a de categoria já traz os dois lados)
    const porMes = new Map<string, { incomeCents: number; expenseCents: number }>();
    for (const ponto of semAporte) {
      const atual = porMes.get(ponto.month) ?? { incomeCents: 0, expenseCents: 0 };
      atual.incomeCents += ponto.incomeCents;
      atual.expenseCents += ponto.expenseCents;
      porMes.set(ponto.month, atual);
    }
    const monthlySeries = [...porMes.entries()]
      .map(([month, valores]) => ({ month, ...valores }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ---- recorrência
    const grupos = detectRecurring(gastoAnalisavel);
    const comNome = (grupo: RecurringGroup): RecurringItem => ({
      ...grupo,
      categoryName: nomeDe(grupo.categoryId),
    });

    // Assinatura só conta como gasto fixo se ainda está viva: uma que
    // sumiu há três meses foi cancelada e não pesa no mês que vem.
    const ativa = (grupo: RecurringGroup) =>
      grupo.lastSeen.slice(0, 7) >= monthsBefore(input.referenceMonth, 1).slice(0, 7);

    const subscriptions = grupos.filter((g) => g.kind === 'subscription').map(comNome);
    const recurring = grupos.filter((g) => g.kind === 'recurring').map(comNome);

    const fixedMonthlyCents = subscriptions
      .filter(ativa)
      .reduce((soma, item) => soma + item.typicalCents, 0);

    // ---- tendência por categoria
    const porCategoria = new Map<string, { month: string; expenseCents: number }[]>();
    for (const ponto of semAporte) {
      if (ponto.expenseCents === 0) continue;
      const chave = ponto.categoryId ?? 'sem-categoria';
      const lista = porCategoria.get(chave) ?? [];
      lista.push({ month: ponto.month, expenseCents: ponto.expenseCents });
      porCategoria.set(chave, lista);
    }

    const trends: CategoryTrend[] = [];
    for (const [chave, pontos] of porCategoria) {
      const ordenados = [...pontos].sort((a, b) => a.month.localeCompare(b.month));
      const atual = ordenados.find((p) => p.month === input.referenceMonth)?.expenseCents ?? 0;
      const anteriores = ordenados.filter((p) => p.month < input.referenceMonth);
      const media =
        anteriores.length > 0
          ? Math.round(anteriores.reduce((s, p) => s + p.expenseCents, 0) / anteriores.length)
          : 0;

      trends.push({
        categoryId: chave === 'sem-categoria' ? null : chave,
        name: chave === 'sem-categoria' ? 'Sem categoria' : (nomeDe(chave) ?? 'Sem categoria'),
        currentCents: atual,
        averageCents: media,
        // Sem histórico não há variação a declarar: 0 é mais honesto que
        // um "+100%" que só diz que o mês passado não existia.
        changePercent: media > 0 ? Math.round(((atual - media) / media) * 100) : 0,
        series: ordenados,
      });
    }
    trends.sort((a, b) => b.currentCents - a.currentCents);

    // ---- estabelecimentos com mais volume
    const merchants = new Map<string, { label: string; totalCents: number; count: number }>();
    for (const grupo of grupos) {
      merchants.set(grupo.key, {
        label: grupo.label,
        totalCents: grupo.monthlyAverageCents * grupo.monthsSeen,
        count: grupo.occurrences,
      });
    }
    const topMerchants = [...merchants.values()]
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 10);

    const expenseMonthlyAverage = Math.round(totalExpense / mesesComDados);

    return {
      period: { from, to, referenceMonth: input.referenceMonth },
      months,
      income: {
        totalCents: totalIncome,
        monthlyAverageCents: Math.round(totalIncome / mesesComDados),
      },
      expense: { totalCents: totalExpense, monthlyAverageCents: expenseMonthlyAverage },
      saving: {
        totalCents: totalSaving,
        monthlyAverageCents: Math.round(totalSaving / mesesComDados),
      },
      savingRatePercent:
        totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : null,
      canCompare: months >= 2,
      canDetectRecurrence: months >= 3,
      fixedMonthlyCents,
      variableMonthlyCents: Math.max(expenseMonthlyAverage - fixedMonthlyCents, 0),
      monthlySeries,
      subscriptions,
      recurring,
      trends,
      topMerchants,
      transactionCount: rawTransactions.length,
    };
  }
}
