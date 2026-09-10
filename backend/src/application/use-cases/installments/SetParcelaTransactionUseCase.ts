import { NotFoundError } from '../../../domain/errors/DomainError.js';
import type { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';

export interface SetParcelaTransactionInput {
  userId: string;
  planId: string;
  number: number;
  /** `null` desliga a parcela da transação em que ela estava. */
  transactionId: string | null;
}

/**
 * Liga (ou desliga) à mão uma parcela e uma cobrança do extrato.
 *
 * O reconhecimento automático depende da marca "4/6" na descrição, e
 * nem todo banco a escreve — nem toda compra parcelada aparece como
 * parcelada. Quando o automático não dá conta, é aqui que a pessoa diz
 * qual lançamento é qual parcela, sem precisar inventar dado nenhum.
 */
export class SetParcelaTransactionUseCase {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(input: SetParcelaTransactionInput): Promise<InstallmentPlan> {
    const plan = await this.plans.findById(input.userId, input.planId);
    if (!plan) throw new NotFoundError('Parcelamento', input.planId);

    if (!plan.parcelas.some((parcela) => parcela.number === input.number)) {
      throw new NotFoundError('Parcela', String(input.number));
    }

    if (input.transactionId !== null) {
      const transacao = await this.transactions.findById(input.userId, input.transactionId);
      if (!transacao) throw new NotFoundError('Transação', input.transactionId);

      // Uma cobrança é uma só. Se ela vira a parcela 3 daqui, deixa de
      // ser a parcela 5 de onde estivesse — inclusive deste mesmo plano.
      await this.plans.clearTransaction(input.userId, input.transactionId);
    }

    await this.plans.setTransaction({
      userId: input.userId,
      planId: input.planId,
      number: input.number,
      transactionId: input.transactionId,
    });

    const atualizado = await this.plans.findById(input.userId, input.planId);
    return atualizado ?? plan;
  }
}
