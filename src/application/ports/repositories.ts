import type { Account } from '../../domain/entities/Account.js';
import type { Category } from '../../domain/entities/Category.js';
import type { EmailSource } from '../../domain/entities/EmailSource.js';
import type { Transaction, TransactionStatus } from '../../domain/entities/Transaction.js';

export interface TransactionFilter {
  ownerId: string;
  accountId?: string;
  categoryId?: string;
  status?: TransactionStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface TransactionRepository {
  /**
   * Insere so se rawSourceId ainda nao existe; devolve null se ja existia.
   * A garantia real e o unique index no banco, nao um SELECT antes do INSERT:
   * dois jobs concorrentes passariam pelo SELECT ao mesmo tempo.
   */
  createIfAbsent(transaction: Transaction): Promise<Transaction | null>;
  findById(id: string): Promise<Transaction | null>;
  findBySourceId(rawSourceId: string): Promise<Transaction | null>;
  list(filter: TransactionFilter): Promise<Transaction[]>;
  update(transaction: Transaction): Promise<Transaction>;
}

export interface AccountRepository {
  create(account: Account): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  listByOwner(ownerId: string): Promise<Account[]>;
}

export interface CategoryRepository {
  listByOwner(ownerId: string): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  findFallback(ownerId: string): Promise<Category | null>;
  /** Grava a regra aprendida na correcao manual, para a proxima vez acertar sozinho. */
  addRule(categoryId: string, match: string): Promise<void>;
}

export interface EmailSourceRepository {
  listEnabled(ownerId: string): Promise<EmailSource[]>;
  findById(id: string): Promise<EmailSource | null>;
}
