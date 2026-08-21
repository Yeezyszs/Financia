import type { Account } from '../../../domain/entities/Account.js';

export interface AccountRepository {
  findById(userId: string, id: string): Promise<Account | null>;
  findByName(userId: string, name: string): Promise<Account | null>;
  listByUser(userId: string, options?: { includeInactive?: boolean }): Promise<Account[]>;
  create(account: Account): Promise<Account>;
  update(account: Account): Promise<Account>;
}
