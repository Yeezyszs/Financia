import type { SupabaseClient } from '@supabase/supabase-js';
import type { Transaction } from '../../../../domain/entities/Transaction.js';
import type {
  CategoryMonthPoint,
  CategoryTotal,
  MonthlyTotal,
  Paginated,
  TransactionFilters,
  TransactionRepository,
} from '../../../../application/ports/repositories/TransactionRepository.js';
import type { AnalyzableTransaction } from '../../../../domain/analysis/RecurringDetector.js';
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

  async listRecategorizable(
    userId: string,
  ): Promise<{ id: string; description: string; categoryId: string | null }[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('id, description, category_id')
      .eq('user_id', userId)
      // Decisão manual anterior é informação: uma regra aprendida não
      // deve desfazer o que a pessoa já escolheu à mão.
      .neq('categorized_by', 'manual');
    if (error) throw error;

    return (data as { id: string; description: string; category_id: string | null }[]).map(
      (row) => ({ id: row.id, description: row.description, categoryId: row.category_id }),
    );
  }

  /**
   * Inverte o sinal de uma importação inteira.
   *
   * Feito com leitura seguida de upsert em vez de uma função no banco:
   * `amount_cents = -amount_cents` é um update que se refere à própria
   * coluna, o que a API REST não expressa. O upsert manda as linhas
   * completas de volta, então cai no caminho de update e vai numa
   * requisição só.
   *
   * O fingerprint não é recalculado: ele identifica a linha no arquivo de
   * origem, e mexer nele faria a reimportação do mesmo extrato duplicar
   * tudo que foi corrigido aqui.
   */
  async flipSignsForImport(userId: string, importId: string): Promise<number> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('import_id', importId);
    if (error) throw error;

    const rows = data as TransactionRow[];
    if (rows.length === 0) return 0;

    const invertidas = rows.map((row) => ({ ...row, amount_cents: -Number(row.amount_cents) }));

    const { error: upsertError } = await this.db
      .from(TABLE)
      .upsert(invertidas, { onConflict: 'id' });
    if (upsertError) throw upsertError;

    return rows.length;
  }

  async setCategoryForMany(
    userId: string,
    ids: string[],
    categoryId: string,
    isTransfer: boolean,
  ): Promise<void> {
    if (ids.length === 0) return;

    const { error } = await this.db
      .from(TABLE)
      .update({
        category_id: categoryId,
        categorized_by: 'rule',
        is_transfer: isTransfer,
        ...(isTransfer ? {} : { counterpart_transaction_id: null }),
      })
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw error;
  }

  async categorySeries(userId: string, from: string, to: string): Promise<CategoryMonthPoint[]> {
    const { data, error } = await this.db.rpc('transactions_category_series', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;

    return (
      data as {
        month: string;
        category_id: string | null;
        income_cents: number;
        expense_cents: number;
        tx_count: number;
      }[]
    ).map((row) => ({
      month: row.month,
      categoryId: row.category_id,
      incomeCents: Number(row.income_cents),
      expenseCents: Number(row.expense_cents),
      count: Number(row.tx_count),
    }));
  }

  async listForAnalysis(
    userId: string,
    from: string,
    to: string,
  ): Promise<AnalyzableTransaction[]> {
    // Sem paginação de propósito: a análise precisa do período inteiro, e
    // são poucos milhares de linhas com quatro colunas.
    const { data, error } = await this.db
      .from(TABLE)
      .select('occurred_on, description, amount_cents, category_id')
      .eq('user_id', userId)
      .eq('is_transfer', false)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: true });
    if (error) throw error;

    return (
      data as {
        occurred_on: string;
        description: string;
        amount_cents: number;
        category_id: string | null;
      }[]
    ).map((row) => ({
      occurredOn: row.occurred_on,
      description: row.description,
      amountCents: Number(row.amount_cents),
      categoryId: row.category_id,
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
