import type { InstallmentPlan } from '../../domain/entities/InstallmentPlan.js';

export const InstallmentPlanPresenter = {
  toHttp(plan: InstallmentPlan) {
    return {
      id: plan.id,
      accountId: plan.accountId,
      description: plan.description,
      merchantKey: plan.merchantKey,
      totalCents: plan.totalCents,
      installments: plan.installments,
      firstChargeOn: plan.firstChargeOn,
      categoryId: plan.categoryId,
      paidCount: plan.pagas.length,
      remainingCents: plan.remainingCents,
      monthlyCents: plan.monthlyCents,
      settled: plan.quitado,
      nextDueOn: plan.proxima?.dueOn ?? null,
      parcelas: plan.parcelas.map((parcela) => ({
        number: parcela.number,
        dueOn: parcela.dueOn,
        amountCents: parcela.amountCents,
        paid: parcela.transactionId !== null || parcela.settled,
        /** Paga sem cobrança no extrato: a tela diz isso em vez de mentir. */
        settled: parcela.settled,
        // A tela precisa do id para mostrar qual cobrança é, e para
        // deixar trocar o vínculo à mão quando a marca não veio.
        transactionId: parcela.transactionId,
      })),
    };
  },
};
