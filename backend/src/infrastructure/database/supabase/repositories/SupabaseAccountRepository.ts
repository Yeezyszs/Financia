import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from '../../../../domain/entities/Account.js';
import type { AccountRepository } from '../../../../application/ports/repositories/AccountRepository.js';
import { AccountMapper, type AccountRow } from '../mappers/AccountMapper.js';

const TABLE = 'accounts';

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(userId: string, id: string): Promise<Account | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? AccountMapper.toDomain(data as AccountRow) : null;
  }

  async findByName(userId: string, name: string): Promise<Account | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .ilike('name', name)
      .maybeSingle();
    if (error) throw error;
    return data ? AccountMapper.toDomain(data as AccountRow) : null;
  }

  async listByUser(
    userId: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<Account[]> {
    let query = this.db.from(TABLE).select('*').eq('user_id', userId).order('name');
    if (!options.includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return (data as AccountRow[]).map(AccountMapper.toDomain);
  }

  async create(account: Account): Promise<Account> {
    const { data, error } = await this.db
      .from(TABLE)
      .insert(AccountMapper.toRow(account))
      .select()
      .single();
    if (error) throw error;
    return AccountMapper.toDomain(data as AccountRow);
  }

  async update(account: Account): Promise<Account> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(AccountMapper.toRow(account))
      .eq('user_id', account.userId)
      .eq('id', account.id)
      .select()
      .single();
    if (error) throw error;
    return AccountMapper.toDomain(data as AccountRow);
  }
}
