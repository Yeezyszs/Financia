import type { SupabaseClient } from '@supabase/supabase-js';
import type { GmailSyncState, GmailSyncStateRepository } from '../../application/ports/repositories';

interface Row {
  owner_id: string;
  email_address: string;
  history_id: string | null;
  watch_expires_at: string | null;
}

export class SupabaseGmailSyncStateRepository implements GmailSyncStateRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(ownerId: string): Promise<GmailSyncState | null> {
    const { data, error } = await this.db.from('gmail_sync_state').select().eq('owner_id', ownerId).maybeSingle();
    if (error) throw new Error(`Falha ao ler estado do sync: ${error.message}`);
    if (!data) return null;

    const row = data as Row;
    return {
      ownerId: row.owner_id,
      emailAddress: row.email_address,
      historyId: row.history_id,
      watchExpiresAt: row.watch_expires_at ? new Date(row.watch_expires_at) : null,
    };
  }

  async save(state: GmailSyncState): Promise<void> {
    const { error } = await this.db.from('gmail_sync_state').upsert({
      owner_id: state.ownerId,
      email_address: state.emailAddress,
      history_id: state.historyId,
      watch_expires_at: state.watchExpiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Falha ao salvar estado do sync: ${error.message}`);
  }
}
