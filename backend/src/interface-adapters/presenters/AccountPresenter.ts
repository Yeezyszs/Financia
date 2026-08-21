import type { Account } from '../../domain/entities/Account.js';

export const AccountPresenter = {
  toHttp(account: Account) {
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      settlementAccountId: account.settlementAccountId,
      isActive: account.isActive,
    };
  },
};
