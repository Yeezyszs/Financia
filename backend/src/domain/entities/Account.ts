import { DomainError } from '../errors/DomainError.js';

export type AccountType = 'checking' | 'credit_card';
export type Institution = 'nubank' | 'c6' | 'manual';

export interface AccountProps {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institution: Institution;
  currency: string;
  /** Para cartão de crédito: conta corrente que paga a fatura. */
  settlementAccountId: string | null;
  isActive: boolean;
}

export class Account {
  constructor(private readonly props: AccountProps) {
    if (!props.name.trim()) throw new DomainError('Conta precisa de um nome', 'INVALID_ACCOUNT');
    if (props.type !== 'credit_card' && props.settlementAccountId) {
      throw new DomainError('Somente cartão de crédito tem conta de quitação', 'INVALID_ACCOUNT');
    }
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get name(): string {
    return this.props.name;
  }
  get type(): AccountType {
    return this.props.type;
  }
  get institution(): Institution {
    return this.props.institution;
  }
  get currency(): string {
    return this.props.currency;
  }
  get settlementAccountId(): string | null {
    return this.props.settlementAccountId;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }

  get isCreditCard(): boolean {
    return this.props.type === 'credit_card';
  }

  toJSON(): AccountProps {
    return { ...this.props };
  }
}
