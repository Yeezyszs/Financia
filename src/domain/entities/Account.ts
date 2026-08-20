import { DomainError } from '../errors/DomainError.js';

export type AccountType = 'conta_corrente' | 'cartao_credito';

export interface AccountProps {
  id: string;
  ownerId: string;
  name: string;
  institution: string;
  type: AccountType;
  /** Ultimos 4 digitos, quando cartao. Usado para casar o e-mail com a conta certa. */
  last4?: string;
  archived?: boolean;
}

/**
 * Uma conta ou cartao monitorado. Multi-conta desde o inicio: cada transacao
 * ingerida precisa saber de qual cartao veio, senao o consolidado mente.
 */
export class Account {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly institution: string;
  readonly type: AccountType;
  readonly last4: string | undefined;
  readonly archived: boolean;

  constructor(props: AccountProps) {
    if (props.name.trim() === '') {
      throw new DomainError('Conta precisa de um nome', 'ACCOUNT_NAME_REQUIRED');
    }
    if (props.institution.trim() === '') {
      throw new DomainError('Conta precisa de uma instituicao', 'ACCOUNT_INSTITUTION_REQUIRED');
    }
    if (props.last4 !== undefined && !/^\d{4}$/.test(props.last4)) {
      throw new DomainError(`last4 deve ter exatamente 4 digitos: "${props.last4}"`, 'ACCOUNT_LAST4_INVALID');
    }

    this.id = props.id;
    this.ownerId = props.ownerId;
    this.name = props.name.trim();
    this.institution = props.institution.trim();
    this.type = props.type;
    this.last4 = props.last4;
    this.archived = props.archived ?? false;
  }

  get isCreditCard(): boolean {
    return this.type === 'cartao_credito';
  }
}
