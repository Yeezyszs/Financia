import { Account, type AccountType } from '../../domain/entities/Account';
import { Category, type CategoryRule } from '../../domain/entities/Category';
import { EmailSource } from '../../domain/entities/EmailSource';
import { Money } from '../../domain/entities/Money';
import { Transaction, type TransactionKind, type TransactionOrigin, type TransactionStatus } from '../../domain/entities/Transaction';

/**
 * Traducao entre linha do Postgres (snake_case, tipos crus) e entidade de
 * dominio. Fica aqui, na borda: o dominio nunca ve snake_case, e o banco
 * nunca ve objeto Money.
 */

export interface AccountRow {
  id: string;
  owner_id: string;
  name: string;
  institution: string;
  type: AccountType;
  last4: string | null;
  archived: boolean;
}

export interface CategoryRow {
  id: string;
  owner_id: string;
  name: string;
  is_fallback: boolean;
  category_rules?: Array<{ match: string; learned: boolean }> | null;
}

export interface EmailSourceRow {
  id: string;
  owner_id: string;
  account_id: string;
  institution: string;
  parser_strategy: string;
  from_addresses: string[];
  subject_contains: string | null;
  enabled: boolean;
}

export interface TransactionRow {
  id: string;
  owner_id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  currency: string;
  merchant: string;
  occurred_at: string;
  kind: TransactionKind;
  status: TransactionStatus;
  origin: TransactionOrigin;
  raw_source_id: string | null;
  reversal_of_id: string | null;
  installment_current: number | null;
  installment_total: number | null;
}

export function toAccount(row: AccountRow): Account {
  return new Account({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    archived: row.archived,
    ...(row.last4 ? { last4: row.last4 } : {}),
  });
}

export function fromAccount(account: Account): AccountRow {
  return {
    id: account.id,
    owner_id: account.ownerId,
    name: account.name,
    institution: account.institution,
    type: account.type,
    last4: account.last4 ?? null,
    archived: account.archived,
  };
}

export function toCategory(row: CategoryRow): Category {
  const rules: CategoryRule[] = (row.category_rules ?? []).map((r) => ({
    match: r.match,
    learned: r.learned,
  }));
  return new Category({ id: row.id, ownerId: row.owner_id, name: row.name, rules });
}

export function toEmailSource(row: EmailSourceRow): EmailSource {
  return new EmailSource({
    id: row.id,
    ownerId: row.owner_id,
    accountId: row.account_id,
    institution: row.institution,
    parserStrategy: row.parser_strategy,
    fromAddresses: row.from_addresses,
    enabled: row.enabled,
    ...(row.subject_contains ? { subjectContains: row.subject_contains } : {}),
  });
}

export function toTransaction(row: TransactionRow): Transaction {
  const installment =
    row.installment_current !== null && row.installment_total !== null
      ? { current: row.installment_current, total: row.installment_total }
      : null;

  return new Transaction({
    id: row.id,
    ownerId: row.owner_id,
    accountId: row.account_id,
    amount: Money.fromCents(row.amount_cents, row.currency),
    merchant: row.merchant,
    occurredAt: new Date(row.occurred_at),
    kind: row.kind,
    categoryId: row.category_id,
    status: row.status,
    origin: row.origin,
    rawSourceId: row.raw_source_id,
    reversalOfId: row.reversal_of_id,
    installment,
  });
}

export function fromTransaction(t: Transaction): TransactionRow {
  return {
    id: t.id,
    owner_id: t.ownerId,
    account_id: t.accountId,
    category_id: t.categoryId,
    amount_cents: t.amount.cents,
    currency: t.amount.currency,
    merchant: t.merchant,
    occurred_at: t.occurredAt.toISOString(),
    kind: t.kind,
    status: t.status,
    origin: t.origin,
    raw_source_id: t.rawSourceId,
    reversal_of_id: t.reversalOfId,
    installment_current: t.installment?.current ?? null,
    installment_total: t.installment?.total ?? null,
  };
}
