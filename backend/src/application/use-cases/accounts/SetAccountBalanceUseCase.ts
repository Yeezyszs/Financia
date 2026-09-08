import { DomainError, NotFoundError } from '../../../domain/errors/DomainError.js';
import type {
  AccountBalanceAnchor,
  AccountBalanceRepository,
} from '../../ports/repositories/AccountBalanceRepository.js';
import type { AccountRepository } from '../../ports/repositories/AccountRepository.js';

/**
 * Registra quanto havia numa conta numa data.
 *
 * Só conta corrente: cartão não tem saldo, tem fatura em aberto, e essa o
 * app calcula sozinho a partir das compras posteriores ao último
 * pagamento. Aceitar um "saldo de cartão" criaria um número que ninguém
 * saberia dizer o que significa.
 */
export class SetAccountBalanceUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly balances: AccountBalanceRepository,
  ) {}

  async execute(input: {
    userId: string;
    accountId: string;
    onDate: string;
    balanceCents: number;
    source?: 'manual' | 'statement';
  }): Promise<AccountBalanceAnchor> {
    const account = await this.accounts.findById(input.userId, input.accountId);
    if (!account) throw new NotFoundError('Conta', input.accountId);

    if (account.isCreditCard) {
      throw new DomainError(
        'Cartão não tem saldo: a fatura em aberto é calculada a partir das compras.',
        'BALANCE_NOT_APPLICABLE',
      );
    }

    return this.balances.upsert(input.userId, {
      accountId: account.id,
      onDate: input.onDate,
      balanceCents: input.balanceCents,
      source: input.source ?? 'manual',
    });
  }
}
