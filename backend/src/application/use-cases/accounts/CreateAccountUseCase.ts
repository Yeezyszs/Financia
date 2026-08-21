import { Account, type AccountType, type Institution } from '../../../domain/entities/Account.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';
import type { IdGenerator } from '../../ports/services/IdGenerator.js';

export interface CreateAccountInput {
  userId: string;
  name: string;
  type: AccountType;
  institution?: Institution;
  currency?: string;
  settlementAccountId?: string | null;
}

export class CreateAccountUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateAccountInput): Promise<Account> {
    const name = input.name.trim();

    const existing = await this.accounts.findByName(input.userId, name);
    if (existing) {
      throw new DomainError(`Já existe uma conta chamada "${name}"`, 'ACCOUNT_ALREADY_EXISTS');
    }

    if (input.settlementAccountId) {
      const settlement = await this.accounts.findById(input.userId, input.settlementAccountId);
      if (!settlement) {
        throw new DomainError('Conta de quitação não encontrada', 'INVALID_ACCOUNT');
      }
      if (settlement.isCreditCard) {
        throw new DomainError(
          'A conta que quita a fatura precisa ser conta corrente',
          'INVALID_ACCOUNT',
        );
      }
    }

    const account = new Account({
      id: this.ids.generate(),
      userId: input.userId,
      name,
      type: input.type,
      institution: input.institution ?? 'nubank',
      currency: input.currency ?? 'BRL',
      settlementAccountId: input.settlementAccountId ?? null,
      isActive: true,
    });

    return this.accounts.create(account);
  }
}
