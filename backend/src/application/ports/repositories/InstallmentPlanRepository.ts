import type { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';

export interface InstallmentPlanRepository {
  listByUser(userId: string): Promise<InstallmentPlan[]>;
  findById(userId: string, id: string): Promise<InstallmentPlan | null>;

  /** Grava o plano e as parcelas dele de uma vez. */
  create(plan: InstallmentPlan): Promise<InstallmentPlan>;

  /** Some com o plano e as parcelas; as transações não são tocadas. */
  delete(userId: string, id: string): Promise<void>;

  /**
   * Liga uma linha da fatura à parcela correspondente. Devolve falso
   * quando a parcela já estava ligada a outra transação — reimportar não
   * pode sobrescrever um vínculo que já existe.
   */
  linkTransaction(input: {
    userId: string;
    planId: string;
    number: number;
    transactionId: string;
  }): Promise<boolean>;
}
