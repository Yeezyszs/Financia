export type AccountType = 'checking' | 'credit_card';
export type CategoryKind = 'income' | 'expense' | 'transfer';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string;
  currency: string;
  settlementAccountId: string | null;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  isSystem: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  occurredOn: string;
  description: string;
  amountCents: number;
  amount: number;
  isTransfer: boolean;
  categorizedBy: 'uncategorized' | 'rule' | 'manual';
  source: 'import' | 'manual';
  importId: string | null;
  notes: string | null;
}

export interface ImportRecord {
  id: string;
  accountId: string;
  filename: string;
  status: 'pending' | 'completed' | 'failed';
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
  periodStart: string | null;
  periodEnd: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MonthlyTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface CategoryBreakdown {
  categoryId: string | null;
  name: string;
  color: string | null;
  totalCents: number;
  count: number;
}

export interface Overview {
  period: { from: string; to: string };
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  expensesByCategory: CategoryBreakdown[];
  monthly: MonthlyTotal[];
}

export interface ImportResult {
  importId: string;
  rowsTotal: number;
  rowsImported: number;
  rowsDuplicated: number;
  categorized: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface TransactionQuery {
  accountIds?: string[];
  categoryIds?: string[];
  from?: string;
  to?: string;
  search?: string;
  includeTransfers?: boolean;
  onlyUncategorized?: boolean;
  limit?: number;
  offset?: number;
}
