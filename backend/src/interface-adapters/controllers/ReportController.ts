import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { GetOverviewUseCase } from '../../application/use-cases/reports/GetOverviewUseCase.js';
import type { ListCategoriesUseCase } from '../../application/use-cases/categories/ListCategoriesUseCase.js';
import type { GetFinancialSnapshotUseCase } from '../../application/use-cases/insights/GetFinancialSnapshotUseCase.js';
import { CategoryPresenter } from '../presenters/CategoryPresenter.js';
import { snapshotToMarkdown } from '../presenters/SnapshotMarkdownPresenter.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const overviewSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  accountIds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()))
    .optional(),
});

/** Primeiro e último dia do mês corrente, que é o default da Visão Geral. */
function currentMonthRange(today = new Date()): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

const snapshotSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  months: z.coerce.number().int().min(2).max(24).optional(),
});

export class ReportController {
  constructor(
    private readonly getOverview: GetOverviewUseCase,
    private readonly listCategories: ListCategoriesUseCase,
    private readonly getSnapshot: GetFinancialSnapshotUseCase,
  ) {}

  snapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = snapshotSchema.parse(req.query);
      const data = await this.getSnapshot.execute({
        userId: req.userId,
        referenceMonth: query.month ?? currentMonthRange().from.slice(0, 7),
        ...(query.months ? { months: query.months } : {}),
      });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  overview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = overviewSchema.parse(req.query);
      const range = currentMonthRange();
      const from = query.from ?? range.from;
      const to = query.to ?? range.to;

      const data = await this.getOverview.execute({
        userId: req.userId,
        from,
        to,
        year: query.year ?? Number(from.slice(0, 4)),
        ...(query.accountIds ? { accountIds: query.accountIds } : {}),
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  };

  /** Mesmo retrato do snapshot, formatado para colar numa conversa. */
  summaryMarkdown = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = snapshotSchema.parse(req.query);
      const snapshot = await this.getSnapshot.execute({
        userId: req.userId,
        referenceMonth: query.month ?? currentMonthRange().from.slice(0, 7),
        ...(query.months ? { months: query.months } : {}),
      });

      res.type('text/markdown; charset=utf-8').send(snapshotToMarkdown(snapshot));
    } catch (error) {
      next(error);
    }
  };

  categories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await this.listCategories.execute({ userId: req.userId });
      res.json({ data: categories.map(CategoryPresenter.toHttp) });
    } catch (error) {
      next(error);
    }
  };
}
