import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '../../domain/entities/Transaction';
import type { TransactionFilter, TransactionRepository } from '../../application/ports/repositories';
import { fromTransaction, toTransaction, type TransactionRow } from './rows';

/** Violacao de unique constraint no Postgres. */
const UNIQUE_VIOLATION = '23505';

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Tenta inserir e trata a violacao do unique index como "ja existia".
   * Esta e a diferenca entre idempotencia de verdade e um SELECT-antes-do-
   * INSERT: quando o cron e o webhook do Pub/Sub processam o mesmo e-mail ao
   * mesmo tempo, os dois passariam pelo SELECT e gravariam. Aqui o segundo
   * toma 23505 do banco e vira no-op.
   */
  async createIfAbsent(transaction: Transaction): Promise<Transaction | null> {
    const { data, error } = await this.db
      .from('transactions')
      .insert(fromTransaction(transaction))
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return null;
      throw new Error(`Falha ao inserir transacao: ${error.message}`);
    }
    return toTransaction(data as TransactionRow);
  }

  async findById(id: string): Promise<Transaction | null> {
    const { data, error } = await this.db.from('transactions').select().eq('id', id).maybeSingle();
    if (error) throw new Error(`Falha ao buscar transacao ${id}: ${error.message}`);
    return data ? toTransaction(data as TransactionRow) : null;
  }

  async findBySourceId(rawSourceId: string): Promise<Transaction | null> {
    const { data, error } = await this.db
      .from('transactions')
      .select()
      .eq('raw_source_id', rawSourceId)
      .maybeSingle();
    if (error) throw new Error(`Falha ao buscar transacao por origem: ${error.message}`);
    return data ? toTransaction(data as TransactionRow) : null;
  }

  async list(filter: TransactionFilter): Promise<Transaction[]> {
    let query = this.db.from('transactions').select().eq('owner_id', filter.ownerId);

    if (filter.accountId) query = query.eq('account_id', filter.accountId);
    if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.from) query = query.gte('occurred_at', filter.from.toISOString());
    if (filter.to) query = query.lte('occurred_at', filter.to.toISOString());

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const { data, error } = await query.order('occurred_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error(`Falha ao listar transacoes: ${error.message}`);
    return (data as TransactionRow[]).map(toTransaction);
  }

  async update(transaction: Transaction): Promise<Transaction> {
    const { data, error } = await this.db
      .from('transactions')
      .update(fromTransaction(transaction))
      .eq('id', transaction.id)
      .select()
      .single();

    if (error) throw new Error(`Falha ao atualizar transacao ${transaction.id}: ${error.message}`);
    return toTransaction(data as TransactionRow);
  }
}
