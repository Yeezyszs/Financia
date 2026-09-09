import type { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';

export interface InstallmentsOverview {
  plans: InstallmentPlan[];
  /** Soma do que ainda vai ser cobrado, de todos os planos abertos. */
  remainingCents: number;
  /** Peso mensal dos planos abertos — o que já está tomado do próximo mês. */
  monthlyCents: number;
  openPlans: number;
}

export class ListInstallmentPlansUseCase {
  constructor(private readonly plans: InstallmentPlanRepository) {}

  async execute(input: { userId: string }): Promise<InstallmentsOverview> {
    const plans = await this.plans.listByUser(input.userId);
    const abertos = plans.filter((plano) => !plano.quitado);

    return {
      // Quitados vão para o fim: eles são histórico, não compromisso.
      plans: [...abertos, ...plans.filter((plano) => plano.quitado)],
      remainingCents: abertos.reduce((soma, plano) => soma + plano.remainingCents, 0),
      monthlyCents: abertos.reduce((soma, plano) => soma + plano.monthlyCents, 0),
      openPlans: abertos.length,
    };
  }
}
