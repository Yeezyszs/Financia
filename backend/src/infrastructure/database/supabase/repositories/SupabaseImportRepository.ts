import type { SupabaseClient } from '@supabase/supabase-js';
import type { Import } from '../../../../domain/entities/Import.js';
import type { ImportRepository } from '../../../../application/ports/repositories/ImportRepository.js';
import { ImportMapper, type ImportRow } from '../mappers/ImportMapper.js';

const TABLE = 'imports';

export class SupabaseImportRepository implements ImportRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(userId: string, id: string): Promise<Import | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? ImportMapper.toDomain(data as ImportRow) : null;
  }

  async findByFileHash(
    userId: string,
    accountId: string,
    fileHash: string,
  ): Promise<Import | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('file_hash', fileHash)
      .maybeSingle();
    if (error) throw error;
    return data ? ImportMapper.toDomain(data as ImportRow) : null;
  }

  async listByUser(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Import[]> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 30;

    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data as ImportRow[]).map(ImportMapper.toDomain);
  }

  async create(record: Import): Promise<Import> {
    const { data, error } = await this.db
      .from(TABLE)
      .insert(ImportMapper.toRow(record))
      .select()
      .single();
    if (error) throw error;
    return ImportMapper.toDomain(data as ImportRow);
  }

  async update(record: Import): Promise<Import> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(ImportMapper.toRow(record))
      .eq('user_id', record.userId)
      .eq('id', record.id)
      .select()
      .single();
    if (error) throw error;
    return ImportMapper.toDomain(data as ImportRow);
  }
}
