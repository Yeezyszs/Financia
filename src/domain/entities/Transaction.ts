import { DomainError } from '../errors/DomainError';
import type { Money } from './Money';

/**
 * pendente     -> ingerida, ainda sem categoria resolvida
 * categorizada -> tem categoria (por regra ou correcao manual)
 * conciliada   -> conferida contra a fatura/extrato pelo usuario
 */
export type TransactionStatus = 'pendente' | 'categorizada' | 'conciliada';

/**
 * purchase -> compra normal
 * refund   -> estorno/cancelamento. Entra como transacao propria com valor
 *             negativo apontando para a original, nunca como DELETE da compra:
 *             o historico do que aconteceu precisa sobreviver.
 */
export type TransactionKind = 'purchase' | 'refund';

/**
 * email     -> aviso de compra recebido por e-mail (valor provisorio)
 * statement -> linha de extrato/fatura importada (valor final, autoritativo)
 * manual    -> lancado a mao pelo usuario
 */
export type TransactionOrigin = 'email' | 'statement' | 'manual';

export interface TransactionProps {
  id: string;
  ownerId: string;
  accountId: string;
  amount: Money;
  merchant: string;
  occurredAt: Date;
  kind?: TransactionKind;
  categoryId?: string | null;
  status?: TransactionStatus;
  origin?: TransactionOrigin;
  /** Message-ID do Gmail. E a chave de idempotencia da ingestao. */
  rawSourceId?: string | null;
  reversalOfId?: string | null;
  installment?: { current: number; total: number } | null;
}

export class Transaction {
  readonly id: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly merchant: string;
  readonly occurredAt: Date;
  readonly kind: TransactionKind;
  readonly categoryId: string | null;
  readonly status: TransactionStatus;
  readonly origin: TransactionOrigin;
  readonly rawSourceId: string | null;
  readonly reversalOfId: string | null;
  readonly installment: { current: number; total: number } | null;

  constructor(props: TransactionProps) {
    if (props.merchant.trim() === '') {
      throw new DomainError('Transacao precisa de um estabelecimento', 'TRANSACTION_MERCHANT_REQUIRED');
    }
    if (Number.isNaN(props.occurredAt.getTime())) {
      throw new DomainError('Data da transacao invalida', 'TRANSACTION_DATE_INVALID');
    }

    const kind = props.kind ?? 'purchase';
    if (kind === 'refund' && !props.amount.isNegative) {
      throw new DomainError('Estorno deve ter valor negativo', 'TRANSACTION_REFUND_SIGN');
    }
    if (kind === 'purchase' && props.amount.isNegative) {
      throw new DomainError('Compra deve ter valor positivo', 'TRANSACTION_PURCHASE_SIGN');
    }

    this.id = props.id;
    this.ownerId = props.ownerId;
    this.accountId = props.accountId;
    this.amount = props.amount;
    this.merchant = props.merchant.trim();
    this.occurredAt = props.occurredAt;
    this.kind = kind;
    this.categoryId = props.categoryId ?? null;
    this.status = props.status ?? (props.categoryId ? 'categorizada' : 'pendente');
    this.origin = props.origin ?? 'email';
    this.rawSourceId = props.rawSourceId ?? null;
    this.reversalOfId = props.reversalOfId ?? null;
    this.installment = props.installment ?? null;
  }

  /** Devolve uma copia categorizada. Entidade imutavel: muda estado criando novo. */
  categorizedAs(categoryId: string): Transaction {
    return new Transaction({ ...this.toProps(), categoryId, status: 'categorizada' });
  }

  reconciled(): Transaction {
    if (this.status === 'pendente') {
      throw new DomainError('Nao da para conciliar transacao sem categoria', 'TRANSACTION_NOT_CATEGORIZED');
    }
    return new Transaction({ ...this.toProps(), status: 'conciliada' });
  }

  toProps(): TransactionProps {
    return {
      id: this.id,
      ownerId: this.ownerId,
      accountId: this.accountId,
      amount: this.amount,
      merchant: this.merchant,
      occurredAt: this.occurredAt,
      kind: this.kind,
      categoryId: this.categoryId,
      status: this.status,
      origin: this.origin,
      rawSourceId: this.rawSourceId,
      reversalOfId: this.reversalOfId,
      installment: this.installment,
    };
  }
}
