import { NotFoundError } from '../../../domain/errors/DomainError.js';
import type { InstallmentPlanRepository } from '../../ports/repositories/InstallmentPlanRepository.js';

export class DeleteInstallmentPlanUseCase {
  constructor(private readonly plans: InstallmentPlanRepository) {}

  async execute(input: { userId: string; planId: string }): Promise<void> {
    const plano = await this.plans.findById(input.userId, input.planId);
    if (!plano) throw new NotFoundError('Parcelamento', input.planId);

    await this.plans.delete(input.userId, plano.id);
  }
}
