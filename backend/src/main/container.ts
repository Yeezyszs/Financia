import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../infrastructure/config/env.js';
import { createSupabaseClient } from '../infrastructure/database/supabase/client.js';
import { SupabaseAccountRepository } from '../infrastructure/database/supabase/repositories/SupabaseAccountRepository.js';
import { SupabaseTransactionRepository } from '../infrastructure/database/supabase/repositories/SupabaseTransactionRepository.js';
import { SupabaseCategoryRepository } from '../infrastructure/database/supabase/repositories/SupabaseCategoryRepository.js';
import { SupabaseCategoryRuleRepository } from '../infrastructure/database/supabase/repositories/SupabaseCategoryRuleRepository.js';
import { SupabaseImportRepository } from '../infrastructure/database/supabase/repositories/SupabaseImportRepository.js';
import { ParserRegistry } from '../infrastructure/parsers/ParserRegistry.js';
import { UuidGenerator } from '../infrastructure/services/UuidGenerator.js';
import { SystemClock } from '../infrastructure/services/SystemClock.js';
import { Sha256Hasher } from '../infrastructure/services/Sha256Hasher.js';
import { CreateAccountUseCase } from '../application/use-cases/accounts/CreateAccountUseCase.js';
import { ListAccountsUseCase } from '../application/use-cases/accounts/ListAccountsUseCase.js';
import { ListTransactionsUseCase } from '../application/use-cases/transactions/ListTransactionsUseCase.js';
import { ImportStatementUseCase } from '../application/use-cases/imports/ImportStatementUseCase.js';
import { ListImportsUseCase } from '../application/use-cases/imports/ListImportsUseCase.js';
import { GetOverviewUseCase } from '../application/use-cases/reports/GetOverviewUseCase.js';
import { ListCategoriesUseCase } from '../application/use-cases/categories/ListCategoriesUseCase.js';
import { AccountController } from '../interface-adapters/controllers/AccountController.js';
import { TransactionController } from '../interface-adapters/controllers/TransactionController.js';
import { ImportController } from '../interface-adapters/controllers/ImportController.js';
import { ReportController } from '../interface-adapters/controllers/ReportController.js';

/**
 * Composition root: o único lugar do sistema que conhece todas as camadas.
 * Trocar Supabase por outro banco é trocar as linhas de repositório aqui.
 */
export interface Container {
  db: SupabaseClient;
  controllers: {
    accounts: AccountController;
    transactions: TransactionController;
    imports: ImportController;
    reports: ReportController;
  };
}

export function buildContainer(env: Env): Container {
  const db = createSupabaseClient(env);

  // infraestrutura
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const hasher = new Sha256Hasher();
  const parsers = new ParserRegistry();
  void clock; // usado quando entrar lançamento manual com data default

  // repositórios
  const accountRepository = new SupabaseAccountRepository(db);
  const transactionRepository = new SupabaseTransactionRepository(db);
  const categoryRepository = new SupabaseCategoryRepository(db);
  const categoryRuleRepository = new SupabaseCategoryRuleRepository(db);
  const importRepository = new SupabaseImportRepository(db);

  // casos de uso
  const createAccount = new CreateAccountUseCase(accountRepository, ids);
  const listAccounts = new ListAccountsUseCase(accountRepository);
  const listTransactions = new ListTransactionsUseCase(transactionRepository);
  const importStatement = new ImportStatementUseCase(
    accountRepository,
    importRepository,
    transactionRepository,
    categoryRepository,
    categoryRuleRepository,
    parsers,
    ids,
    hasher,
  );
  const listImports = new ListImportsUseCase(importRepository);
  const getOverview = new GetOverviewUseCase(transactionRepository, categoryRepository);
  const listCategories = new ListCategoriesUseCase(categoryRepository);

  return {
    db,
    controllers: {
      accounts: new AccountController(createAccount, listAccounts),
      transactions: new TransactionController(listTransactions),
      imports: new ImportController(importStatement, listImports),
      reports: new ReportController(getOverview, listCategories),
    },
  };
}
