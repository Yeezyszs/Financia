import { DomainError } from '../errors/DomainError';

export interface EmailSourceProps {
  id: string;
  ownerId: string;
  accountId: string;
  institution: string;
  /** Chave que resolve qual parser roda. Casa com EmailParser.institution. */
  parserStrategy: string;
  /** Remetentes aceitos. Guarda contra e-mail de phishing imitando o banco. */
  fromAddresses: string[];
  /** Filtro de assunto opcional, para reduzir o volume lido do Gmail. */
  subjectContains?: string;
  enabled?: boolean;
}

/**
 * Liga uma caixa de e-mail a uma conta: "e-mail vindo de X, com assunto Y,
 * e uma transacao do cartao Z e deve ser lido pelo parser W".
 */
export class EmailSource {
  readonly id: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly institution: string;
  readonly parserStrategy: string;
  readonly fromAddresses: string[];
  readonly subjectContains: string | undefined;
  readonly enabled: boolean;

  constructor(props: EmailSourceProps) {
    if (props.fromAddresses.length === 0) {
      throw new DomainError('EmailSource precisa de ao menos um remetente', 'EMAIL_SOURCE_FROM_REQUIRED');
    }
    if (props.parserStrategy.trim() === '') {
      throw new DomainError('EmailSource precisa de um parserStrategy', 'EMAIL_SOURCE_PARSER_REQUIRED');
    }

    this.id = props.id;
    this.ownerId = props.ownerId;
    this.accountId = props.accountId;
    this.institution = props.institution;
    this.parserStrategy = props.parserStrategy.trim();
    this.fromAddresses = props.fromAddresses.map((a) => a.toLowerCase().trim());
    this.subjectContains = props.subjectContains;
    this.enabled = props.enabled ?? true;
  }

  accepts(fromAddress: string): boolean {
    const from = fromAddress.toLowerCase();
    return this.fromAddresses.some((allowed) => from.includes(allowed));
  }

  /** Query no formato do Gmail, usada para buscar so o que interessa desta fonte. */
  toGmailQuery(): string {
    const from = this.fromAddresses.map((a) => `from:${a}`).join(' OR ');
    const subject = this.subjectContains ? ` subject:"${this.subjectContains}"` : '';
    return `(${from})${subject}`;
  }
}
