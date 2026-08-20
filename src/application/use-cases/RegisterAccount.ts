import { Account, type AccountType } from '../../domain/entities/Account.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { AccountRepository } from '../ports/repositories.js';

export class RegisterAccount {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: {
    ownerId: string;
    name: string;
    institution: string;
    type: AccountType;
    last4?: string;
  }): Promise<Account> {
    const account = new Account({
      id: this.ids.next(),
      ownerId: input.ownerId,
      name: input.name,
      institution: input.institution,
      type: input.type,
      ...(input.last4 !== undefined ? { last4: input.last4 } : {}),
    });
    return this.accounts.create(account);
  }
}
