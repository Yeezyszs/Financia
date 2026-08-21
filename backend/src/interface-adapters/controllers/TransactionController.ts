import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ListTransactionsUseCase } from '../../application/use-cases/transactions/ListTransactionsUseCase.js';
import { TransactionPresenter } from '../presenters/TransactionPresenter.js';

const csv = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(z.array(z.string().uuid()));

const listSchema = z.object({
  accountIds: csv.optional(),
  categoryIds: csv.optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().min(1).optional(),
  includeTransfers: z.coerce.boolean().optional(),
  onlyUncategorized: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export class TransactionController {
  constructor(private readonly listTransactions: ListTransactionsUseCase) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = listSchema.parse(req.query);
      const result = await this.listTransactions.execute({ userId: req.userId, ...filters });
      res.json({
        data: result.items.map(TransactionPresenter.toHttp),
        meta: { total: result.total, limit: filters.limit ?? 50, offset: filters.offset ?? 0 },
      });
    } catch (error) {
      next(error);
    }
  };
}
