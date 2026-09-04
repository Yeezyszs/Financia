export type AccountType = 'checking' | 'credit_card';
export type Institution = 'nubank' | 'c6' | 'manual';
export type CategoryKind = 'income' | 'expense' | 'transfer';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: Institution;
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

/**
 * Um recorte pedido pela Visão geral: "me mostre as transações por trás
 * deste número". `rotulo` é o que a tela de Transações exibe para dizer
 * de onde a pessoa veio — sem isso o filtro aplicado parece ter surgido
 * do nada.
 */
export interface Drill {
  rotulo: string;
  categoryIds?: string[];
  from?: string;
  to?: string;
  search?: string;
  onlyUncategorized?: boolean;
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

export interface RecurringItem {
  key: string;
  label: string;
  kind: 'subscription' | 'recurring';
  occurrences: number;
  monthsSeen: number;
  typicalCents: number;
  monthlyAverageCents: number;
  firstSeen: string;
  lastSeen: string;
  categoryId: string | null;
  categoryName: string | null;
}

export interface CategoryTrend {
  categoryId: string | null;
  name: string;
  currentCents: number;
  averageCents: number;
  changePercent: number;
  series: { month: string; expenseCents: number }[];
}

export interface Snapshot {
  period: { from: string; to: string; referenceMonth: string };
  months: number;
  income: { totalCents: number; monthlyAverageCents: number };
  expense: { totalCents: number; monthlyAverageCents: number };
  fixedMonthlyCents: number;
  variableMonthlyCents: number;
  subscriptions: RecurringItem[];
  recurring: RecurringItem[];
  trends: CategoryTrend[];
  topMerchants: { label: string; totalCents: number; count: number }[];
  transactionCount: number;
}
