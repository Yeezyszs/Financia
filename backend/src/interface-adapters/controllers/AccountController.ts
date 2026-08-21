import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { CreateAccountUseCase } from '../../application/use-cases/accounts/CreateAccountUseCase.js';
import type { ListAccountsUseCase } from '../../application/use-cases/accounts/ListAccountsUseCase.js';
import { AccountPresenter } from '../presenters/AccountPresenter.js';

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['checking', 'credit_card']),
  institution: z.enum(['nubank', 'c6', 'manual']).optional(),
  currency: z.string().length(3).optional(),
  settlementAccountId: z.string().uuid().nullable().optional(),
});

export class AccountController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly listAccounts: ListAccountsUseCase,
  ) {}

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
