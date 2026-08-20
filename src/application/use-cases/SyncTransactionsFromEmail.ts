import type { EmailGateway } from '../ports/EmailGateway.js';
import type { EmailSourceRepository } from '../ports/repositories.js';
import type { IngestOutcome, IngestTransactionFromEmail } from './IngestTransactionFromEmail.js';

export interface SyncReport {
  ingested: number;
  duplicates: number;
  skipped: number;
  failures: Array<{ rawSourceId: string; reason: string }>;
}

/**
 * Varre as fontes cadastradas e joga cada e-mail no use case de ingestao.
 * Serve tanto para o cron quanto para o webhook do Pub/Sub - a diferenca
 * entre os dois e so quem chama e com qual janela de tempo.
 */
export class SyncTransactionsFromEmail {
  constructor(
    private readonly sources: EmailSourceRepository,
    private readonly emails: EmailGateway,
    private readonly ingest: IngestTransactionFromEmail,
  ) {}

  async execute(input: { ownerId: string; since?: Date; maxPerSource?: number }): Promise<SyncReport> {
    const report: SyncReport = { ingested: 0, duplicates: 0, skipped: 0, failures: [] };
    const sources = await this.sources.listEnabled(input.ownerId);

    for (const source of sources) {
      const query: { query: string; after?: Date; maxResults?: number } = { query: source.toGmailQuery() };
      if (input.since) query.after = input.since;
      if (input.maxPerSource) query.maxResults = input.maxPerSource;

      const emails = await this.emails.search(query);

      for (const email of emails) {
        try {
          const outcome = await this.ingest.execute(email, source);
          this.tally(report, outcome);
        } catch (error) {
          // Um e-mail com formato inesperado nao pode derrubar o sync inteiro:
          // registra a falha e segue para o proximo.
          report.failures.push({
            rawSourceId: email.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return report;
  }

  private tally(report: SyncReport, outcome: IngestOutcome): void {
    if (outcome.status === 'ingested') report.ingested += 1;
    else if (outcome.status === 'duplicate') report.duplicates += 1;
    else report.skipped += 1;
  }
}
