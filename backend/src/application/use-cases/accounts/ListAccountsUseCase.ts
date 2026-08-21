import type { Account } from '../../../domain/entities/Account.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';

export class ListAccountsUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(input: { userId: string; includeInactive?: boolean }): Promise<Account[]> {
    return this.accounts.listByUser(input.userId, { includeInactive: input.includeInactive });
  }
}
