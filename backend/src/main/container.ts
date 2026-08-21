import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../infrastructure/config/env.js';
import { createSupabaseClient } from '../infrastructure/database/supabase/client.js';
import { SupabaseAccountRepository } from '../infrastructure/database/supabase/repositories/SupabaseAccountRepository.js';
import { SupabaseTransactionRepository } from '../infrastructure/database/supabase/repositories/SupabaseTransactionRepository.js';
import { UuidGenerator } from '../infrastructure/services/UuidGenerator.js';
import { SystemClock } from '../infrastructure/services/SystemClock.js';
import { Sha256Hasher } from '../infrastructure/services/Sha256Hasher.js';
import { CreateAccountUseCase } from '../application/use-cases/accounts/CreateAccountUseCase.js';
import { ListAccountsUseCase } from '../application/use-cases/accounts/ListAccountsUseCase.js';
import { ListTransactionsUseCase } from '../application/use-cases/transactions/ListTransactionsUseCase.js';
import { AccountController } from '../interface-adapters/controllers/AccountController.js';
import { TransactionController } from '../interface-adapters/controllers/TransactionController.js';

/**
 * Composition root: o único lugar do sistema que conhece todas as camadas.
 * Trocar Supabase por outro banco é trocar as linhas de repositório aqui.
 */
export interface Container {
  db: SupabaseClient;
  controllers: {
    accounts: AccountController;
    transactions: TransactionController;
  };
}

export function buildContainer(env: Env): Container {
  const db = createSupabaseClient(env);

  // infraestrutura
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const hasher = new Sha256Hasher();
  void clock;
  void hasher; // usados a partir da Fase 2 (importação)

  // repositórios
  const accountRepository = new SupabaseAccountRepository(db);
  const transactionRepository = new SupabaseTransactionRepository(db);

  // casos de uso
  const createAccount = new CreateAccountUseCase(accountRepository, ids);
  const listAccounts = new ListAccountsUseCase(accountRepository);
  const listTransactions = new ListTransactionsUseCase(transactionRepository);

  return {
    db,
    controllers: {
      accounts: new AccountController(createAccount, listAccounts),
      transactions: new TransactionController(listTransactions),
    },
  };
}
