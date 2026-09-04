import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ListTransactionsUseCase } from '../../application/use-cases/transactions/ListTransactionsUseCase.js';
import type { CategorizeTransactionUseCase } from '../../application/use-cases/transactions/CategorizeTransactionUseCase.js';
import type { UpdateTransactionUseCase } from '../../application/use-cases/transactions/UpdateTransactionUseCase.js';
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

const categorizeSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  remember: z.boolean().optional(),
});

const updateSchema = z
  .object({
    direction: z.enum(['expense', 'income']).optional(),
    isTransfer: z.boolean().optional(),
  })
  .refine((body) => body.direction !== undefined || body.isTransfer !== undefined, {
    message: 'Informe direction ou isTransfer',
  });

export class TransactionController {
  constructor(
    private readonly listTransactions: ListTransactionsUseCase,
    private readonly categorizeTransaction: CategorizeTransactionUseCase,
    private readonly updateTransaction: UpdateTransactionUseCase,
  ) {}

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateSchema.parse(req.body);
      const id = z.string().uuid().parse(req.params.id);

      const transaction = await this.updateTransaction.execute({
        userId: req.userId,
        transactionId: id,
        ...(body.direction ? { direction: body.direction } : {}),
        ...(body.isTransfer === undefined ? {} : { isTransfer: body.isTransfer }),
      });

      res.json({ data: TransactionPresenter.toHttp(transaction) });
    } catch (error) {
      next(error);
    }
  };

  categorize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = categorizeSchema.parse(req.body);
      const id = z.string().uuid().parse(req.params.id);

      const result = await this.categorizeTransaction.execute({
        userId: req.userId,
        transactionId: id,
        categoryId: body.categoryId,
        ...(body.remember === undefined ? {} : { remember: body.remember }),
      });

      res.json({
        data: {
          transaction: TransactionPresenter.toHttp(result.transaction),
          learnedPattern: result.learnedPattern,
          alsoUpdatedIds: result.alsoUpdatedIds,
        },
      });
    } catch (error) {
      next(error);
    }
  };

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
