import { chaveDaCompra, gerarParcelas } from '../../../domain/analysis/InstallmentPlanning.js';
import { InstallmentPlan, type Installment } from '../../../domain/entities/InstallmentPlan.js';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';

export interface UpdateInstallmentPlanInput {
  userId: string;
  planId: string;
  accountId?: string;
  description?: string;
  /** Como a compra aparece na fatura, para o reconhecimento automático. */
  merchantKey?: string;
  totalCents?: number;
  installments?: number;
  firstChargeOn?: string;
  categoryId?: string | null;
  /** Quantas das primeiras parcelas contam como pagas sem lançamento. */
  paidCount?: number;
}

/**
 * Corrige um parcelamento já cadastrado.
 *
 * Existe porque errar aqui é fácil e caro: trocar o valor da parcela
 * pelo total transforma uma compra de R$ 618 em 48x numa de R$ 12,88
 * por mês, e o número que o app mostra passa a mentir por quatro anos.
 * Sem edição, o conserto seria apagar e refazer — perdendo junto os
 * vínculos que a importação já tinha reconhecido.
 */
export class UpdateInstallmentPlanUseCase {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly accounts: AccountRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: UpdateInstallmentPlanInput,
  ): Promise<{ plan: InstallmentPlan; unlinked: number }> {
    const atual = await this.plans.findById(input.userId, input.planId);
    if (!atual) throw new NotFoundError('Parcelamento', input.planId);

    if (input.accountId && input.accountId !== atual.accountId) {
      const conta = await this.accounts.findById(input.userId, input.accountId);
      if (!conta) throw new NotFoundError('Conta', input.accountId);
    }

    if (input.firstChargeOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.firstChargeOn)) {
      throw new DomainError('Data da primeira cobrança inválida', 'INVALID_PLAN');
    }

    const totalCents = input.totalCents ?? atual.totalCents;
    const installments = input.installments ?? atual.installments;
    const firstChargeOn = input.firstChargeOn ?? atual.firstChargeOn;
    const description = (input.description ?? atual.description).trim();

    // A chave só muda quando a pessoa pede. Renomear "Fast Shop Notebook"
    // para "Notebook do trabalho" é organização pessoal e não pode
    // quebrar o reconhecimento das cobranças que ainda vêm — por isso a
    // descrição e a chave são campos separados desde o começo.
    const merchantKey =
      input.merchantKey === undefined ? atual.merchantKey : chaveDaCompra(input.merchantKey.trim());

    const calendario = gerarParcelas({ totalCents, installments, firstChargeOn });
    const anteriores = new Map(atual.parcelas.map((parcela) => [parcela.number, parcela]));

    if (input.paidCount !== undefined && (input.paidCount < 0 || input.paidCount > installments)) {
      throw new DomainError(
        `Parcelas pagas precisa estar entre 0 e ${installments}`,
        'INVALID_PLAN',
      );
    }

    const parcelas = calendario.map((parcela): Installment => {
      const antes = anteriores.get(parcela.number);
      return {
        id: antes?.id ?? this.ids.generate(),
        number: parcela.number,
        dueOn: parcela.dueOn,
        amountCents: parcela.amountCents,
        // O vínculo sobrevive à correção: a cobrança da parcela 3
        // continua sendo a cobrança da parcela 3 mesmo que o valor do
        // plano inteiro estivesse errado.
        transactionId: antes?.transactionId ?? null,
        // A baixa manual é contada do começo: "já paguei 5" quer dizer
        // as cinco primeiras. Quem não mandou o campo não quis mexer
        // nele, e o que estava marcado continua marcado.
        settled:
          input.paidCount === undefined
            ? (antes?.settled ?? false)
            : parcela.number <= input.paidCount,
      };
    });

    // Encurtar o plano descarta as parcelas que passaram a não existir.
    // As transações delas ficam onde estão — elas são fato do extrato.
    const perdidos = atual.parcelas.filter(
      (parcela) => parcela.transactionId !== null && parcela.number > installments,
    ).length;

    const plan = new InstallmentPlan({
      id: atual.id,
      userId: atual.userId,
      accountId: input.accountId ?? atual.accountId,
      description,
      merchantKey,
      totalCents,
      installments,
      firstChargeOn,
      categoryId: input.categoryId === undefined ? atual.categoryId : input.categoryId,
      parcelas,
    });

    return { plan: await this.plans.update(plan), unlinked: perdidos };
  }
}
