import { casaComPlano } from '../../../domain/analysis/InstallmentPlanning.js';
import type { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';

export interface LinhaParaLigar {
  id: string;
  description: string;
}

/**
 * Liga linhas de fatura às parcelas dos planos abertos.
 *
 * É o mesmo trabalho em dois momentos: quando um extrato novo chega, e
 * quando um plano é cadastrado depois das compras já terem entrado. Ter
 * um serviço só evita que as duas entradas divirjam — que é como um
 * plano criado hoje deixaria de reconhecer a parcela de ontem.
 */
export class LinkInstallmentsService {
  constructor(private readonly plans: InstallmentPlanRepository) {}

  async ligar(input: {
    userId: string;
    linhas: LinhaParaLigar[];
    /** Quando vier, só estes planos são considerados. */
    planos?: InstallmentPlan[];
  }): Promise<number> {
    const planos = input.planos ?? (await this.plans.listByUser(input.userId));
    const abertos = planos.filter((plano) => !plano.quitado);
    if (abertos.length === 0 || input.linhas.length === 0) return 0;

    let ligadas = 0;

    for (const linha of input.linhas) {
      for (const plano of abertos) {
        const casou = casaComPlano(linha.description, {
          merchantKey: plano.merchantKey,
          installments: plano.installments,
        });
        if (!casou) continue;

        const ok = await this.plans.linkTransaction({
          userId: input.userId,
          planId: plano.id,
          number: casou.numero,
          transactionId: linha.id,
        });
        if (ok) ligadas += 1;

        // Uma linha pertence a um plano só: casada, para de procurar.
        break;
      }
    }

    return ligadas;
  }
}
