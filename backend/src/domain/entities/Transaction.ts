import { DomainError } from '../errors/DomainError.js';
import { Money } from '../value-objects/Money.js';
import { buildFingerprint } from '../value-objects/TransactionFingerprint.js';

export type CategorizedBy = 'uncategorized' | 'rule' | 'manual';
export type TransactionSource = 'import' | 'manual';

export interface TransactionProps {
  id: string;
  userId: string;
  accountId: string;
  importId: string | null;
  categoryId: string | null;
  /** Data da transação, sempre YYYY-MM-DD (date puro, sem fuso). */
  occurredOn: string;
  description: string;
  amount: Money;
  /** Pagamento de fatura e afins: não entra em receita nem despesa. */
  isTransfer: boolean;
  counterpartTransactionId: string | null;
  categorizedBy: CategorizedBy;
  appliedRuleId: string | null;
  source: TransactionSource;
  fingerprint: string;
  notes: string | null;
}

export class Transaction {
  constructor(private readonly props: TransactionProps) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(props.occurredOn)) {
      throw new DomainError(`Data inválida: ${props.occurredOn}`, 'INVALID_TRANSACTION');
    }
    if (!props.description.trim()) {
      throw new DomainError('Transação precisa de descrição', 'INVALID_TRANSACTION');
    }
    if (props.amount.cents === 0) {
      throw new DomainError('Transação de valor zero não é registrada', 'INVALID_TRANSACTION');
    }
  }

  static create(input: {
    id: string;
    userId: string;
    accountId: string;
    occurredOn: string;
    description: string;
    amount: Money;
    ordinal?: number;
    importId?: string | null;
    categoryId?: string | null;
    categorizedBy?: CategorizedBy;
    appliedRuleId?: string | null;
    source?: TransactionSource;
    isTransfer?: boolean;
    notes?: string | null;
  }): Transaction {
    return new Transaction({
      id: input.id,
      userId: input.userId,
      accountId: input.accountId,
      importId: input.importId ?? null,
      categoryId: input.categoryId ?? null,
      occurredOn: input.occurredOn,
      description: input.description.trim(),
      amount: input.amount,
      isTransfer: input.isTransfer ?? false,
      counterpartTransactionId: null,
      categorizedBy: input.categorizedBy ?? (input.categoryId ? 'manual' : 'uncategorized'),
      appliedRuleId: input.appliedRuleId ?? null,
      source: input.source ?? 'import',
      fingerprint: buildFingerprint({
        accountId: input.accountId,
        occurredOn: input.occurredOn,
        description: input.description,
        amountCents: input.amount.cents,
        ordinal: input.ordinal,
      }),
      notes: input.notes ?? null,
    });
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
  get importId(): string | null {
    return this.props.importId;
  }
  get categoryId(): string | null {
    return this.props.categoryId;
  }
  get occurredOn(): string {
    return this.props.occurredOn;
  }
  get description(): string {
    return this.props.description;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get isTransfer(): boolean {
    return this.props.isTransfer;
  }
  get counterpartTransactionId(): string | null {
    return this.props.counterpartTransactionId;
  }
  get categorizedBy(): CategorizedBy {
    return this.props.categorizedBy;
  }
  get appliedRuleId(): string | null {
    return this.props.appliedRuleId;
  }
  get source(): TransactionSource {
    return this.props.source;
  }
  get fingerprint(): string {
    return this.props.fingerprint;
  }
  get notes(): string | null {
    return this.props.notes;
  }

  /** Só conta como despesa se for saída E não for transferência interna. */
  get countsAsExpense(): boolean {
    return !this.props.isTransfer && this.props.amount.isExpense;
  }

  get countsAsIncome(): boolean {
    return !this.props.isTransfer && this.props.amount.isIncome;
  }

  /** Categorização automática/manual sempre passa por aqui. */
  categorize(
    categoryId: string,
    by: Exclude<CategorizedBy, 'uncategorized'>,
    ruleId?: string,
  ): Transaction {
    return new Transaction({
      ...this.props,
      categoryId,
      categorizedBy: by,
      appliedRuleId: ruleId ?? null,
    });
  }

  /**
   * Força a transação a ser saída ou entrada, invertendo o valor se
   * necessário.
   *
   * O fingerprint NÃO é recalculado de propósito. Ele é a identidade da
   * linha no arquivo de origem; recalcular faria a reimportação do mesmo
   * extrato deixar de reconhecer esta linha e criar uma duplicata. A
   * correção é sobre como o valor é interpretado, não sobre qual linha
   * ele é.
   */
  withDirection(direction: 'expense' | 'income'): Transaction {
    const desejado = direction === 'expense' ? -Math.abs(this.props.amount.cents) : Math.abs(this.props.amount.cents);
    if (desejado === this.props.amount.cents) return this;

    return new Transaction({ ...this.props, amount: Money.fromCents(desejado) });
  }

  /** Entra ou sai do somatório sem mexer na categoria. */
  withTransferFlag(isTransfer: boolean): Transaction {
    if (isTransfer === this.props.isTransfer) return this;
    return isTransfer ? this.markAsTransfer() : this.asRegularEntry();
  }

  /** Remove a categoria — volta a contar como não categorizada. */
  uncategorize(): Transaction {
    return new Transaction({
      ...this.props,
      categoryId: null,
      categorizedBy: 'uncategorized',
      appliedRuleId: null,
    });
  }

  /**
   * Desfaz a marcação de transferência.
   *
   * Recategorizar de "Transferências" para "Mercado" precisa desmarcar,
   * senão a transação sai da categoria mas continua fora dos totais — e
   * o gasto some da Visão Geral sem explicação.
   */
  asRegularEntry(): Transaction {
    return new Transaction({ ...this.props, isTransfer: false, counterpartTransactionId: null });
  }

  /** Marca as duas pontas do pagamento de fatura como transferência. */
  markAsTransfer(counterpartId: string | null = null): Transaction {
    return new Transaction({
      ...this.props,
      isTransfer: true,
      counterpartTransactionId: counterpartId,
    });
  }

  toJSON(): Omit<TransactionProps, 'amount'> & { amountCents: number } {
    const { amount, ...rest } = this.props;
    return { ...rest, amountCents: amount.cents };
  }
}
