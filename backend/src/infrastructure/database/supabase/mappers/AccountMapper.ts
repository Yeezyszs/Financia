import { Account, type AccountProps } from '../../../../domain/entities/Account.js';

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: AccountProps['type'];
  institution: AccountProps['institution'];
  currency: string;
  settlement_account_id: string | null;
  is_active: boolean;
}

export const AccountMapper = {
  toDomain(row: AccountRow): Account {
    return new Account({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type,
      institution: row.institution,
      currency: row.currency,
      settlementAccountId: row.settlement_account_id,
      isActive: row.is_active,
    });
  },

  toRow(account: Account): AccountRow {
    return {
      id: account.id,
      user_id: account.userId,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      settlement_account_id: account.settlementAccountId,
      is_active: account.isActive,
    };
  },
};
