import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailSource } from '../../domain/entities/EmailSource';
import type { EmailSourceRepository } from '../../application/ports/repositories';
import { toEmailSource, type EmailSourceRow } from './rows';

export class SupabaseEmailSourceRepository implements EmailSourceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listEnabled(ownerId: string): Promise<EmailSource[]> {
    const { data, error } = await this.db
      .from('email_sources')
      .select()
      .eq('owner_id', ownerId)
      .eq('enabled', true);
    if (error) throw new Error(`Falha ao listar fontes de e-mail: ${error.message}`);
    return (data as EmailSourceRow[]).map(toEmailSource);
  }

  async findById(id: string): Promise<EmailSource | null> {
    const { data, error } = await this.db.from('email_sources').select().eq('id', id).maybeSingle();
    if (error) throw new Error(`Falha ao buscar fonte de e-mail ${id}: ${error.message}`);
    return data ? toEmailSource(data as EmailSourceRow) : null;
  }
}
