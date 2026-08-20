import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account } from '../../domain/entities/Account';
import type { AccountRepository } from '../../application/ports/repositories';
import { fromAccount, toAccount, type AccountRow } from './rows';

export class SupabaseAccountRepository implements AccountRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(account: Account): Promise<Account> {
    const { data, error } = await this.db.from('accounts').insert(fromAccount(account)).select().single();
    if (error) throw new Error(`Falha ao criar conta: ${error.message}`);
    return toAccount(data as AccountRow);
  }

  async findById(id: string): Promise<Account | null> {
    const { data, error } = await this.db.from('accounts').select().eq('id', id).maybeSingle();
    if (error) throw new Error(`Falha ao buscar conta ${id}: ${error.message}`);
    return data ? toAccount(data as AccountRow) : null;
  }

  async listByOwner(ownerId: string): Promise<Account[]> {
    const { data, error } = await this.db
      .from('accounts')
      .select()
      .eq('owner_id', ownerId)
      .eq('archived', false)
      .order('name');
    if (error) throw new Error(`Falha ao listar contas: ${error.message}`);
    return (data as AccountRow[]).map(toAccount);
  }
}
