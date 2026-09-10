import type { InstallmentPlan } from '../../../domain/entities/InstallmentPlan.js';

export interface InstallmentPlanRepository {
  listByUser(userId: string): Promise<InstallmentPlan[]>;
  findById(userId: string, id: string): Promise<InstallmentPlan | null>;

  /** Grava o plano e as parcelas dele de uma vez. */
  create(plan: InstallmentPlan): Promise<InstallmentPlan>;

  /**
   * Regrava o plano e o calendário de parcelas. As parcelas que somem
   * (um plano de 48 que vira de 6) saem; as que ficam mantêm o vínculo
   * que já tinham, porque a transação não deixou de existir só porque a
   * conta do plano estava errada.
   */
  update(plan: InstallmentPlan): Promise<InstallmentPlan>;

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

  /**
   * O vínculo feito à mão, que manda sobre o automático: aqui a pessoa
   * está corrigindo o que a importação não reconheceu ou reconheceu
   * errado, então sobrescrever é o comportamento certo. `null` desliga.
   */
  setTransaction(input: {
    userId: string;
    planId: string;
    number: number;
    transactionId: string | null;
  }): Promise<void>;

  /**
   * Tira esta transação de qualquer parcela em que ela esteja. Uma
   * cobrança da fatura é uma só: se ela passa a ser a parcela 3 daqui,
   * deixou de ser a 5 de lá.
   */
  clearTransaction(userId: string, transactionId: string): Promise<void>;
}
