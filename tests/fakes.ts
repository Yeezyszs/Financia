import { Account } from '../src/domain/entities/Account';
import { Category, type CategoryRule } from '../src/domain/entities/Category';
import type { Transaction } from '../src/domain/entities/Transaction';
import type { IdGenerator } from '../src/application/ports/IdGenerator';
import type { AccountRepository, CategoryRepository, TransactionFilter, TransactionRepository } from '../src/application/ports/repositories';

export class FakeTransactionRepository implements TransactionRepository {
  readonly rows: Transaction[] = [];

  async createIfAbsent(transaction: Transaction): Promise<Transaction | null> {
    if (transaction.rawSourceId && this.rows.some((t) => t.rawSourceId === transaction.rawSourceId)) {
      return null;
    }
    this.rows.push(transaction);
    return transaction;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.rows.find((t) => t.id === id) ?? null;
  }

  async findBySourceId(rawSourceId: string): Promise<Transaction | null> {
    return this.rows.find((t) => t.rawSourceId === rawSourceId) ?? null;
  }

  async list(filter: TransactionFilter): Promise<Transaction[]> {
    return this.rows
      .filter((t) => t.ownerId === filter.ownerId)
      .filter((t) => !filter.accountId || t.accountId === filter.accountId)
      .slice(0, filter.limit ?? 50);
  }

  async update(transaction: Transaction): Promise<Transaction> {
    const index = this.rows.findIndex((t) => t.id === transaction.id);
    if (index >= 0) this.rows[index] = transaction;
    return transaction;
  }
}

export class FakeCategoryRepository implements CategoryRepository {
  constructor(private readonly rows: Category[]) {}

  async listByOwner(ownerId: string): Promise<Category[]> {
    return this.rows.filter((c) => c.ownerId === ownerId);
  }

  async findById(id: string): Promise<Category | null> {
    return this.rows.find((c) => c.id === id) ?? null;
  }

  async findFallback(ownerId: string): Promise<Category | null> {
    return this.rows.find((c) => c.ownerId === ownerId && c.isFallback) ?? null;
  }

  async addRule(categoryId: string, match: string): Promise<void> {
    const category = this.rows.find((c) => c.id === categoryId);
    if (!category) return;
    const rule: CategoryRule = { match, learned: true };
    category.rules.push(rule);
  }
}

export function sequentialIds(prefix = 'id'): IdGenerator {
  let counter = 0;
  return { next: () => `${prefix}-${++counter}` };
}

export function category(id: string, name: string, matches: string[], ownerId = 'pedro'): Category {
  return new Category({
    id,
    ownerId,
    name,
    rules: matches.map((match) => ({ match, learned: false })),
  });
}

export class FakeAccountRepository implements AccountRepository {
  constructor(private readonly rows: Account[] = []) {}

  async create(account: Account): Promise<Account> {
    this.rows.push(account);
    return account;
  }

  async findById(id: string): Promise<Account | null> {
    return this.rows.find((a) => a.id === id) ?? null;
  }

  async listByOwner(ownerId: string): Promise<Account[]> {
    return this.rows.filter((a) => a.ownerId === ownerId);
  }
}

export function account(id: string, ownerId = 'pedro'): Account {
  return new Account({ id, ownerId, name: 'Cartao', institution: 'Nubank', type: 'cartao_credito' });
}
