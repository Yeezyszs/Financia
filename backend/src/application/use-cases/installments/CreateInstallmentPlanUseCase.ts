import { chaveDaCompra, gerarParcelas } from '../../../domain/analysis/InstallmentPlanning.js';
import { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';
import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';
import type { TransactionRepository } from '../../ports/repositories/TransactionRepository.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';
import { LinkInstallmentsService } from './LinkInstallmentsService.js';

export interface CreateInstallmentPlanInput {
  userId: string;
  accountId: string;
  description: string;
  totalCents: number;
  installments: number;
  firstChargeOn: string;
  categoryId?: string | null;
  /**
   * Chave de casamento. Quando o plano nasce de uma transação já
   * importada, vem o descritor do banco; quando é digitado, vem vazia e
   * a descrição faz as vezes.
   */
  merchantKey?: string;
  /**
   * Quantas das primeiras parcelas já foram pagas. Serve para cadastrar
   * uma compra que já vem correndo há meses, cujas faturas nunca foram
   * importadas — sem isso o app diria que falta pagar o valor inteiro.
   */
  paidCount?: number;
}

export class CreateInstallmentPlanUseCase {
  constructor(
    private readonly plans: InstallmentPlanRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: CreateInstallmentPlanInput,
  ): Promise<{ plan: InstallmentPlan; linked: number }> {
    const account = await this.accounts.findById(input.userId, input.accountId);
    if (!account) throw new NotFoundError('Conta', input.accountId);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.firstChargeOn)) {
      throw new DomainError('Data da primeira cobrança inválida', 'INVALID_PLAN');
    }

    const parcelas = gerarParcelas({
      totalCents: input.totalCents,
      installments: input.installments,
      firstChargeOn: input.firstChargeOn,
    });

    const plan = new InstallmentPlan({
      id: this.ids.generate(),
      userId: input.userId,
      accountId: account.id,
      description: input.description.trim(),
      merchantKey: chaveDaCompra(input.merchantKey?.trim() || input.description),
      totalCents: input.totalCents,
      installments: input.installments,
      firstChargeOn: input.firstChargeOn,
      categoryId: input.categoryId ?? null,
      parcelas: parcelas.map((parcela) => ({
        id: this.ids.generate(),
        number: parcela.number,
        dueOn: parcela.dueOn,
        amountCents: parcela.amountCents,
        transactionId: null,
        settled: parcela.number <= (input.paidCount ?? 0),
      })),
    });

    const salvo = await this.plans.create(plan);

    // As compras costumam entrar antes do cadastro: quem lembra de
    // registrar o parcelamento é quem já viu a primeira parcela na
    // fatura. Sem esta varredura, o plano nasceria zerado.
    const movimentos = await this.transactions.listForLinking(input.userId, account.id);
    const linked = await new LinkInstallmentsService(this.plans).ligar({
      userId: input.userId,
      linhas: movimentos,
      planos: [salvo],
    });

    const atualizado = await this.plans.findById(input.userId, salvo.id);
    return { plan: atualizado ?? salvo, linked };
  }
}
