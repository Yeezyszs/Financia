import { Category, type CategoryRule } from '../src/domain/entities/Category.js';
import type { Transaction } from '../src/domain/entities/Transaction.js';
import type { IdGenerator } from '../src/application/ports/IdGenerator.js';
import type { CategoryRepository, TransactionFilter, TransactionRepository } from '../src/application/ports/repositories.js';

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
