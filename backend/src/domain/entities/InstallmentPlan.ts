import { DomainError } from '../errors/DomainError.js';

export interface Installment {
  id: string;
  number: number;
  /** YYYY-MM-DD */
  dueOn: string;
  amountCents: number;
  /** Preenchido quando a linha da fatura chegou e foi reconhecida. */
  transactionId: string | null;
  /**
   * Baixa dada à mão, sem cobrança no extrato. É o caso de cadastrar
   * uma compra que já vem sendo paga há meses, de faturas que nunca
   * foram importadas — a pessoa sabe que pagou, o app não tem como
   * saber, e inventar transações para representar isso sujaria o
   * extrato, que é registro do que o banco disse.
   */
  settled: boolean;
}

export interface InstallmentPlanProps {
  id: string;
  userId: string;
  accountId: string;
  description: string;
  /** Chave de casamento com as linhas da fatura. */
  merchantKey: string;
  totalCents: number;
  installments: number;
  firstChargeOn: string;
  categoryId: string | null;
  parcelas: Installment[];
}

/**
 * Uma compra parcelada.
 *
 * O que ela responde, e o extrato sozinho não: quanto ainda falta. Uma
 * fatura diz "Parcela 4/6" e nada mais — que faltam duas é uma conclusão
 * que só existe se alguém guardar a compra inteira em algum lugar.
 */
export class InstallmentPlan {
  constructor(private readonly props: InstallmentPlanProps) {
    if (!props.description.trim()) {
      throw new DomainError('A compra parcelada precisa de uma descrição', 'INVALID_PLAN');
    }
    if (props.installments < 2) {
      throw new DomainError('Parcelamento tem no mínimo 2 parcelas', 'INVALID_PLAN');
    }
    if (props.totalCents <= 0) {
      throw new DomainError('O valor total precisa ser positivo', 'INVALID_PLAN');
    }
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get accountId(): string {
    return this.props.accountId;
  }
  get description(): string {
    return this.props.description;
  }
  get merchantKey(): string {
    return this.props.merchantKey;
  }
  get totalCents(): number {
    return this.props.totalCents;
  }
  get installments(): number {
    return this.props.installments;
  }
  get firstChargeOn(): string {
    return this.props.firstChargeOn;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get parcelas(): Installment[] {
    return this.props.parcelas;
  }

  /** Paga é ter cobrança reconhecida no extrato ou baixa dada à mão. */
  get pagas(): Installment[] {
    return this.props.parcelas.filter((p) => p.transactionId !== null || p.settled);
  }

  get emAberto(): Installment[] {
    return this.props.parcelas.filter((p) => p.transactionId === null && !p.settled);
  }

  /**
   * O que ainda vai ser cobrado. É o número que falta no app: dinheiro
   * já comprometido, antes de gastar qualquer coisa no mês que vem.
   */
  get remainingCents(): number {
    return this.emAberto.reduce((soma, p) => soma + p.amountCents, 0);
  }

  /** Quanto pesa por mês enquanto durar. */
  get monthlyCents(): number {
    return Math.round(this.props.totalCents / this.props.installments);
  }

  get quitado(): boolean {
    return this.emAberto.length === 0;
  }

  /** A próxima cobrança, ou nulo quando não falta nenhuma. */
  get proxima(): Installment | null {
    return [...this.emAberto].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null;
  }

  toJSON(): InstallmentPlanProps {
    return { ...this.props, parcelas: [...this.props.parcelas] };
  }
}
