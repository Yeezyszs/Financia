import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountBalanceAnchor,
  AccountBalanceRepository,
} from '../../../../application/ports/repositories/AccountBalanceRepository.js';

const TABLE = 'account_balances';

interface Row {
  account_id: string;
  on_date: string;
  balance_cents: number;
  source: 'manual' | 'statement';
}

export class SupabaseAccountBalanceRepository implements AccountBalanceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async latestByAccount(userId: string): Promise<Map<string, AccountBalanceAnchor>> {
    // Ordenado do mais recente para o mais antigo: a primeira linha de
    // cada conta é a que vale, e o resto é histórico.
    const { data, error } = await this.db
      .from(TABLE)
      .select('account_id, on_date, balance_cents, source')
      .eq('user_id', userId)
      .order('on_date', { ascending: false });
    if (error) throw error;

    const porConta = new Map<string, AccountBalanceAnchor>();
    for (const row of data as Row[]) {
      if (porConta.has(row.account_id)) continue;
      porConta.set(row.account_id, {
        accountId: row.account_id,
        onDate: row.on_date,
        balanceCents: Number(row.balance_cents),
        source: row.source,
      });
    }
    return porConta;
  }

  async upsert(userId: string, anchor: AccountBalanceAnchor): Promise<AccountBalanceAnchor> {
    const { data, error } = await this.db
      .from(TABLE)
      .upsert(
        {
          user_id: userId,
          account_id: anchor.accountId,
          on_date: anchor.onDate,
          balance_cents: anchor.balanceCents,
          source: anchor.source,
        },
        { onConflict: 'account_id,on_date' },
      )
      .select('account_id, on_date, balance_cents, source')
      .single();
    if (error) throw error;

    const row = data as Row;
    return {
      accountId: row.account_id,
      onDate: row.on_date,
      balanceCents: Number(row.balance_cents),
      source: row.source,
    };
  }
}
