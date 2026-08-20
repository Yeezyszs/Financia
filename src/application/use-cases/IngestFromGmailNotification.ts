import type { GmailPushGateway } from '../ports/GmailPushGateway';
import type { EmailSourceRepository, GmailSyncStateRepository } from '../ports/repositories';
import type { IngestTransactionFromEmail } from './IngestTransactionFromEmail';
import type { SyncReport } from './SyncTransactionsFromEmail';

/**
 * Caminho do push: o Pub/Sub avisa "sua caixa mudou, o historyId agora e X".
 * A notificacao NAO diz qual e-mail chegou - e preciso perguntar ao Gmail o
 * que aconteceu entre o checkpoint anterior e agora.
 */
export class IngestFromGmailNotification {
  constructor(
    private readonly gmail: GmailPushGateway,
    private readonly sources: EmailSourceRepository,
    private readonly syncState: GmailSyncStateRepository,
    private readonly ingest: IngestTransactionFromEmail,
  ) {}

  async execute(input: { ownerId: string; emailAddress: string; historyId: string }): Promise<SyncReport> {
    const report: SyncReport = { ingested: 0, duplicates: 0, skipped: 0, failures: [] };
    const state = await this.syncState.get(input.ownerId);

    // Primeira notificacao: nao ha janela para consultar ainda. Grava o
    // checkpoint e espera a proxima - o backfill do passado e trabalho do
    // /api/sync, que busca por query em vez de history.
    if (!state?.historyId) {
      await this.syncState.save({
        ownerId: input.ownerId,
        emailAddress: input.emailAddress,
        historyId: input.historyId,
        watchExpiresAt: state?.watchExpiresAt ?? null,
      });
      return report;
    }

    const messageIds = await this.gmail.messageIdsSince(state.historyId);
    const sources = await this.sources.listEnabled(input.ownerId);

    for (const messageId of messageIds) {
      try {
        const email = await this.gmail.getById(messageId);
        if (!email) continue;

        // A notificacao cobre a caixa inteira, entao a maioria dos e-mails nao
        // e de banco. Roteia pelo remetente; sem fonte casando, ignora.
        const source = sources.find((s) => s.accepts(email.from));
        if (!source) {
          report.skipped += 1;
          continue;
        }

        const outcome = await this.ingest.execute(email, source);
        if (outcome.status === 'ingested') report.ingested += 1;
        else if (outcome.status === 'duplicate') report.duplicates += 1;
        else report.skipped += 1;
      } catch (error) {
        report.failures.push({
          rawSourceId: messageId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Checkpoint so avanca no fim: se o processo morrer no meio, a proxima
    // notificacao reprocessa a janela inteira - e a idempotencia do
    // raw_source_id garante que reprocessar nao duplica nada.
    await this.syncState.save({
      ownerId: input.ownerId,
      emailAddress: input.emailAddress,
      historyId: input.historyId,
      watchExpiresAt: state.watchExpiresAt,
    });

    return report;
  }
}
