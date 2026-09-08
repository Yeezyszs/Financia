export interface AccountBalanceAnchor {
  accountId: string;
  /** Saldo ao fim deste dia. */
  onDate: string;
  balanceCents: number;
  source: 'manual' | 'statement';
}

export interface AccountBalanceRepository {
  /** Âncora mais recente de cada conta do usuário. */
  latestByAccount(userId: string): Promise<Map<string, AccountBalanceAnchor>>;

  /**
   * Grava a âncora daquele dia, substituindo a que existia. Reinformar o
   * saldo do mesmo dia é correção, não um segundo fato.
   */
  upsert(userId: string, anchor: AccountBalanceAnchor): Promise<AccountBalanceAnchor>;
}
