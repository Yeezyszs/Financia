import { Transaction, type TransactionProps } from '../../../../domain/entities/Transaction.js';
import { Money } from '../../../../domain/value-objects/Money.js';

export interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string;
  import_id: string | null;
  category_id: string | null;
  occurred_on: string;
  description: string;
  amount_cents: number;
  is_transfer: boolean;
  counterpart_transaction_id: string | null;
  categorized_by: TransactionProps['categorizedBy'];
  applied_rule_id: string | null;
  source: TransactionProps['source'];
  fingerprint: string;
  notes: string | null;
}

export const TransactionMapper = {
  toDomain(row: TransactionRow): Transaction {
    return new Transaction({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      importId: row.import_id,
      categoryId: row.category_id,
      occurredOn: row.occurred_on,
      description: row.description,
      amount: Money.fromCents(Number(row.amount_cents)),
      isTransfer: row.is_transfer,
      counterpartTransactionId: row.counterpart_transaction_id,
      categorizedBy: row.categorized_by,
      appliedRuleId: row.applied_rule_id,
      source: row.source,
      fingerprint: row.fingerprint,
      notes: row.notes,
    });
  },

  toRow(tx: Transaction): TransactionRow {
    return {
      id: tx.id,
      user_id: tx.userId,
      account_id: tx.accountId,
      import_id: tx.importId,
      category_id: tx.categoryId,
      occurred_on: tx.occurredOn,
      description: tx.description,
      amount_cents: tx.amount.cents,
      is_transfer: tx.isTransfer,
      counterpart_transaction_id: tx.counterpartTransactionId,
      categorized_by: tx.categorizedBy,
      applied_rule_id: tx.appliedRuleId,
      source: tx.source,
      fingerprint: tx.fingerprint,
      notes: tx.notes,
    };
  },
};
