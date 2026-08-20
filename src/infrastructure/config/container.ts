import { createClient } from '@supabase/supabase-js';
import { CategorizeTransaction } from '../../application/use-cases/CategorizeTransaction';
import { IngestTransactionFromEmail } from '../../application/use-cases/IngestTransactionFromEmail';
import { ListTransactions } from '../../application/use-cases/ListTransactions';
import { RecategorizeTransaction } from '../../application/use-cases/RecategorizeTransaction';
import { RegisterAccount } from '../../application/use-cases/RegisterAccount';
import { SyncTransactionsFromEmail } from '../../application/use-cases/SyncTransactionsFromEmail';
import { IngestFromGmailNotification } from '../../application/use-cases/IngestFromGmailNotification';
import { ImportStatementFile } from '../../application/use-cases/ImportStatementFile';
import { cryptoIdGenerator } from '../../application/ports/IdGenerator';
import { GmailClient } from '../gateways/email/GmailClient';
import { GoogleOAuthTokenProvider } from '../gateways/email/GoogleOAuthTokenProvider';
import { InMemoryParserRegistry } from '../gateways/email/InMemoryParserRegistry';
import { C6EmailParser } from '../gateways/email/parsers/C6EmailParser';
import { NubankEmailParser } from '../gateways/email/parsers/NubankEmailParser';
import { ConfidenceParserRegistry } from '../gateways/statement/StatementParserRegistry';
import { NubankCardStatementParser } from '../gateways/statement/parsers/NubankCardStatementParser';
import { SupabaseAccountRepository } from '../repositories/SupabaseAccountRepository';
import { SupabaseCategoryRepository } from '../repositories/SupabaseCategoryRepository';
import { SupabaseEmailSourceRepository } from '../repositories/SupabaseEmailSourceRepository';
import { SupabaseGmailSyncStateRepository } from '../repositories/SupabaseGmailSyncStateRepository';
import { SupabaseTransactionRepository } from '../repositories/SupabaseTransactionRepository';
import { env } from './env';

/**
 * Composition root: o UNICO lugar do projeto que sabe que existe Supabase e
 * Gmail ao mesmo tempo. Tudo acima daqui conversa por interface.
 *
 * Banco novo entra aqui, na lista de parsers, e em mais lugar nenhum.
 */
export function buildContainer() {
  const db = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const transactions = new SupabaseTransactionRepository(db);
  const accounts = new SupabaseAccountRepository(db);
  const categories = new SupabaseCategoryRepository(db);
  const emailSources = new SupabaseEmailSourceRepository(db);
  const gmailSyncState = new SupabaseGmailSyncStateRepository(db);

  const gmail = new GmailClient(
    new GoogleOAuthTokenProvider({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      refreshToken: env.googleRefreshToken,
    }),
  );

  const parsers = new InMemoryParserRegistry([new NubankEmailParser(), new C6EmailParser()]);

  // Extrato nao chega rotulado como o e-mail chega: o formato e reconhecido
  // pelo cabecalho. Sem parser dedicado que case, o generico assume.
  const statementParsers = new ConfidenceParserRegistry([new NubankCardStatementParser()]);

  const categorize = new CategorizeTransaction(categories);
  const ingest = new IngestTransactionFromEmail(parsers, transactions, categorize, cryptoIdGenerator);

  return {
    db,
    gmail,
    repositories: { transactions, accounts, categories, emailSources, gmailSyncState },
    useCases: {
      ingest,
      categorize,
      sync: new SyncTransactionsFromEmail(emailSources, gmail, ingest),
      ingestFromNotification: new IngestFromGmailNotification(gmail, emailSources, gmailSyncState, ingest),
      listTransactions: new ListTransactions(transactions),
      recategorize: new RecategorizeTransaction(transactions, categories),
      registerAccount: new RegisterAccount(accounts, cryptoIdGenerator),
      importStatement: new ImportStatementFile(statementParsers, transactions, accounts, categorize, cryptoIdGenerator),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
