import { Account } from '../../src/domain/entities/Account.js';
import { Category } from '../../src/domain/entities/Category.js';
import { CategoryRule } from '../../src/domain/entities/CategoryRule.js';
import type { Import } from '../../src/domain/entities/Import.js';
import type { Transaction } from '../../src/domain/entities/Transaction.js';
import type { AccountRepository } from '../../src/application/ports/repositories/AccountRepository.js';
import type { CategoryRepository } from '../../src/application/ports/repositories/CategoryRepository.js';
import type { CategoryRuleRepository } from '../../src/application/ports/repositories/CategoryRuleRepository.js';
import type { ImportRepository } from '../../src/application/ports/repositories/ImportRepository.js';
import type {
  CategoryMonthPoint,
  CategoryTotal,
  MonthlyTotal,
  Paginated,
  TransactionFilters,
  TransactionRepository,
} from '../../src/application/ports/repositories/TransactionRepository.js';
import type { IdGenerator } from '../../src/application/ports/services/IdGenerator.js';

export const USER_ID = 'user-1';

export class SequentialIds implements IdGenerator {
  private next = 0;
  generate(): string {
    this.next += 1;
    return `id-${this.next}`;
  }
}

export class InMemoryAccountRepository implements AccountRepository {
  constructor(public accounts: Account[] = []) {}
  async findById(userId: string, id: string) {
    return this.accounts.find((a) => a.userId === userId && a.id === id) ?? null;
  }
  async findByName(userId: string, name: string) {
    return this.accounts.find((a) => a.userId === userId && a.name === name) ?? null;
  }
  async listByUser(userId: string) {
    return this.accounts.filter((a) => a.userId === userId);
  }
  async create(account: Account) {
    this.accounts.push(account);
    return account;
  }
  async update(account: Account) {
    this.accounts = this.accounts.map((a) => (a.id === account.id ? account : a));
    return account;
  }
}

export class InMemoryImportRepository implements ImportRepository {
  constructor(public records: Import[] = []) {}
  async findById(userId: string, id: string) {
    return this.records.find((r) => r.userId === userId && r.id === id) ?? null;
  }
  async findByFileHash(userId: string, accountId: string, fileHash: string) {
    return (
      this.records.find(
        (r) => r.userId === userId && r.accountId === accountId && r.fileHash === fileHash,
      ) ?? null
    );
  }
  async listByUser(userId: string) {
    return this.records.filter((r) => r.userId === userId);
  }
  async create(record: Import) {
    this.records.push(record);
    return record;
  }
  async update(record: Import) {
    this.records = this.records.map((r) => (r.id === record.id ? record : r));
    return record;
  }
  async delete(userId: string, id: string) {
    this.records = this.records.filter((r) => !(r.userId === userId && r.id === id));
  }
}

export class InMemoryTransactionRepository implements TransactionRepository {
  constructor(public transactions: Transaction[] = []) {}
  async findById(userId: string, id: string) {
    return this.transactions.find((t) => t.userId === userId && t.id === id) ?? null;
  }
  async list(userId: string, _filters: TransactionFilters): Promise<Paginated<Transaction>> {
    const items = this.transactions.filter((t) => t.userId === userId);
    return { items, total: items.length };
  }
  async findExistingFingerprints(userId: string, fingerprints: string[]) {
    const known = new Set(
      this.transactions.filter((t) => t.userId === userId).map((t) => t.fingerprint),
    );
    return new Set(fingerprints.filter((f) => known.has(f)));
  }
  async createMany(transactions: Transaction[]) {
    this.transactions.push(...transactions);
    return transactions;
  }
  async update(transaction: Transaction) {
    this.transactions = this.transactions.map((t) => (t.id === transaction.id ? transaction : t));
    return transaction;
  }
  async delete(userId: string, id: string) {
    this.transactions = this.transactions.filter((t) => !(t.userId === userId && t.id === id));
  }
  async totalsByCategory(): Promise<CategoryTotal[]> {
    return [];
  }
  async monthlyTotals(): Promise<MonthlyTotal[]> {
    return [];
  }
  async flipSignsForImport(userId: string, importId: string) {
    let afetadas = 0;
    this.transactions = this.transactions.map((t) => {
      if (t.userId !== userId || t.importId !== importId) return t;
      afetadas += 1;
      return t.withDirection(t.amount.cents > 0 ? 'expense' : 'income');
    });
    return afetadas;
  }
  async deleteByImport(userId: string, importId: string) {
    const antes = this.transactions.length;
    this.transactions = this.transactions.filter(
      (t) => !(t.userId === userId && t.importId === importId),
    );
    return antes - this.transactions.length;
  }
  async listRecategorizable(userId: string) {
    return this.transactions
      .filter((t) => t.userId === userId && t.categorizedBy !== 'manual')
      .map((t) => ({ id: t.id, description: t.description, categoryId: t.categoryId }));
  }
  async setCategoryForMany(
    userId: string,
    ids: string[],
    categoryId: string,
    isTransfer: boolean,
    categorizedBy: 'rule' | 'manual',
  ) {
    let afetadas = 0;
    this.transactions = this.transactions.map((t) => {
      if (t.userId !== userId || !ids.includes(t.id)) return t;
      afetadas += 1;
      const comCategoria = t.categorize(categoryId, categorizedBy);
      return isTransfer ? comCategoria.markAsTransfer() : comCategoria.asRegularEntry();
    });
    return afetadas;
  }
  async categorySeries(): Promise<CategoryMonthPoint[]> {
    return [];
  }
  async listForAnalysis(userId: string, from: string, to: string) {
    return this.transactions
      .filter((t) => t.userId === userId && t.occurredOn >= from && t.occurredOn <= to)
      .map((t) => ({
        occurredOn: t.occurredOn,
        description: t.description,
        amountCents: t.amount.cents,
        categoryId: t.categoryId,
      }));
  }
}

export class InMemoryCategoryRepository implements CategoryRepository {
  constructor(public categories: Category[] = []) {}
  async findById(userId: string, id: string) {
    return this.categories.find((c) => c.userId === userId && c.id === id) ?? null;
  }
  async findByName(userId: string, name: string) {
    return this.categories.find((c) => c.userId === userId && c.name === name) ?? null;
  }
  async listByUser(userId: string) {
    return this.categories.filter((c) => c.userId === userId);
  }
  async create(category: Category) {
    this.categories.push(category);
    return category;
  }
  async update(category: Category) {
    this.categories = this.categories.map((atual) => (atual.id === category.id ? category : atual));
    return category;
  }
  async delete() {}
}

export class InMemoryCategoryRuleRepository implements CategoryRuleRepository {
  public hits: string[] = [];
  constructor(public rules: CategoryRule[] = []) {}
  async listActiveByUser(userId: string) {
    return this.rules.filter((r) => r.userId === userId && r.isActive);
  }
  async findById(userId: string, id: string) {
    return this.rules.find((r) => r.userId === userId && r.id === id) ?? null;
  }
  async findByPattern(userId: string, pattern: string, matchType: CategoryRule['matchType']) {
    return (
      this.rules.find(
        (r) =>
          r.userId === userId &&
          r.pattern === pattern &&
          r.matchType === matchType &&
          r.accountId === null,
      ) ?? null
    );
  }
  async create(rule: CategoryRule) {
    this.rules.push(rule);
    return rule;
  }
  async update(rule: CategoryRule) {
    // Precisa substituir de fato: um dublê que aceita o update e guarda o
    // valor antigo esconde justamente o bug que o teste procura.
    this.rules = this.rules.map((atual) => (atual.id === rule.id ? rule : atual));
    return rule;
  }
  async delete() {}
  async incrementHits(ruleIds: string[]) {
    this.hits.push(...ruleIds);
  }
}

export function makeChecking(): Account {
  return new Account({
    id: 'acc-checking',
    userId: USER_ID,
    name: 'Nubank Conta Corrente',
    type: 'checking',
    institution: 'nubank',
    currency: 'BRL',
    settlementAccountId: null,
    isActive: true,
  });
}

export function makeCard(): Account {
  return new Account({
    id: 'acc-card',
    userId: USER_ID,
    name: 'Nubank Cartão',
    type: 'credit_card',
    institution: 'nubank',
    currency: 'BRL',
    settlementAccountId: 'acc-checking',
    isActive: true,
  });
}

export function makeCategory(id: string, name: string, kind: Category['kind']): Category {
  return new Category({ id, userId: USER_ID, name, kind, color: null, icon: null, isSystem: true });
}

export function makeRule(
  id: string,
  pattern: string,
  categoryId: string,
  priority = 10,
): CategoryRule {
  return new CategoryRule({
    id,
    userId: USER_ID,
    categoryId,
    pattern,
    matchType: 'contains',
    accountId: null,
    priority,
    source: 'system',
    isActive: true,
  });
}
