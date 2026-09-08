import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { CreateAccountUseCase } from '../../application/use-cases/accounts/CreateAccountUseCase.js';
import type { ListAccountsUseCase } from '../../application/use-cases/accounts/ListAccountsUseCase.js';
import type { SetAccountBalanceUseCase } from '../../application/use-cases/accounts/SetAccountBalanceUseCase.js';
import { AccountPresenter } from '../presenters/AccountPresenter.js';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['checking', 'credit_card']),
  institution: z.enum(['nubank', 'c6', 'manual']).optional(),
  currency: z.string().length(3).optional(),
  settlementAccountId: z.string().uuid().nullable().optional(),
});

const balanceSchema = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Aceita negativo: conta no vermelho é um saldo como outro qualquer.
  balanceCents: z.number().int(),
});

export class AccountController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly listAccounts: ListAccountsUseCase,
    private readonly setBalance: SetAccountBalanceUseCase,
  ) {}

  /** Informa quanto havia na conta numa data. */
  balance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const body = balanceSchema.parse(req.body);
      const anchor = await this.setBalance.execute({ userId: req.userId, accountId: id, ...body });
      res.json({ data: anchor });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accounts = await this.listAccounts.execute({
        userId: req.userId,
        includeInactive: req.query.includeInactive === 'true',
      });
      res.json({ data: accounts.map(AccountPresenter.toHttp) });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const account = await this.createAccount.execute({ userId: req.userId, ...body });
      res.status(201).json({ data: AccountPresenter.toHttp(account) });
    } catch (error) {
      next(error);
    }
  };
}
