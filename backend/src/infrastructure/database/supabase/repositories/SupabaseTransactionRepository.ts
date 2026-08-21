import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '../../../../domain/entities/Transaction.js';
import type {
  CategoryTotal,
  MonthlyTotal,
  Paginated,
  TransactionFilters,
  TransactionRepository,
} from '../../../../application/ports/repositories/TransactionRepository.js';
import { TransactionMapper, type TransactionRow } from '../mappers/TransactionMapper.js';

const TABLE = 'transactions';
/** Postgres tem limite prático de parâmetros; quebramos o IN em lotes. */
const FINGERPRINT_CHUNK = 500;

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findById(userId: string, id: string): Promise<Transaction | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? TransactionMapper.toDomain(data as TransactionRow) : null;
  }

  async list(userId: string, filters: TransactionFilters): Promise<Paginated<Transaction>> {
    let query = this.db
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.accountIds?.length) query = query.in('account_id', filters.accountIds);
    if (filters.categoryIds?.length) query = query.in('category_id', filters.categoryIds);
    if (filters.from) query = query.gte('occurred_on', filters.from);
    if (filters.to) query = query.lte('occurred_on', filters.to);
    if (filters.search) query = query.ilike('description', `%${filters.search}%`);
    if (!filters.includeTransfers) query = query.eq('is_transfer', false);
    if (filters.onlyUncategorized) query = query.is('category_id', null);

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 50;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      items: (data as TransactionRow[]).map(TransactionMapper.toDomain),
      total: count ?? 0,
    };
  }

  async findExistingFingerprints(userId: string, fingerprints: string[]): Promise<Set<string>> {
    const found = new Set<string>();

    for (let i = 0; i < fingerprints.length; i += FINGERPRINT_CHUNK) {
      const chunk = fingerprints.slice(i, i + FINGERPRINT_CHUNK);
      const { data, error } = await this.db
        .from(TABLE)
        .select('fingerprint')
        .eq('user_id', userId)
        .in('fingerprint', chunk);
      if (error) throw error;
      for (const row of data as { fingerprint: string }[]) found.add(row.fingerprint);
    }

    return found;
  }

  async createMany(transactions: Transaction[]): Promise<Transaction[]> {
    if (transactions.length === 0) return [];

    const { data, error } = await this.db
      .from(TABLE)
      .insert(transactions.map(TransactionMapper.toRow))
      .select();
    if (error) throw error;
    return (data as TransactionRow[]).map(TransactionMapper.toDomain);
  }

  async update(transaction: Transaction): Promise<Transaction> {
    const { data, error } = await this.db
      .from(TABLE)
      .update(TransactionMapper.toRow(transaction))
      .eq('user_id', transaction.userId)
      .eq('id', transaction.id)
      .select()
      .single();
    if (error) throw error;
    return TransactionMapper.toDomain(data as TransactionRow);
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await this.db.from(TABLE).delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
  }

  async totalsByCategory(userId: string, filters: TransactionFilters): Promise<CategoryTotal[]> {
    const { data, error } = await this.db.rpc('transactions_totals_by_category', {
      p_user_id: userId,
      p_from: filters.from ?? null,
      p_to: filters.to ?? null,
      p_account_ids: filters.accountIds?.length ? filters.accountIds : null,
    });
    if (error) throw error;

    return (
      data as {
        category_id: string | null;
        income_cents: number;
        expense_cents: number;
        tx_count: number;
      }[]
    ).map((row) => ({
      categoryId: row.category_id,
      incomeCents: Number(row.income_cents),
      expenseCents: Number(row.expense_cents),
      count: Number(row.tx_count),
    }));
  }

  async monthlyTotals(userId: string, year: number): Promise<MonthlyTotal[]> {
    const { data, error } = await this.db.rpc('transactions_monthly_totals', {
      p_user_id: userId,
      p_year: year,
    });
    if (error) throw error;

    return (data as { month: string; income_cents: number; expense_cents: number }[]).map(
      (row) => ({
        month: row.month,
        incomeCents: Number(row.income_cents),
        expenseCents: Number(row.expense_cents),
      }),
    );
  }
}
