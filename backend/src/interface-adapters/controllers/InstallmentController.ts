import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { CreateInstallmentPlanUseCase } from '../../application/use-cases/installments/CreateInstallmentPlanUseCase.js';
import type { ListInstallmentPlansUseCase } from '../../application/use-cases/installments/ListInstallmentPlansUseCase.js';
import type { DeleteInstallmentPlanUseCase } from '../../application/use-cases/installments/DeleteInstallmentPlanUseCase.js';
import { InstallmentPlanPresenter } from '../presenters/InstallmentPlanPresenter.js';

const createSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().min(1).max(120),
  totalCents: z.number().int().positive(),
  installments: z.number().int().min(2).max(72),
  firstChargeOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid().nullable().optional(),
  merchantKey: z.string().max(120).optional(),
});

export class InstallmentController {
  constructor(
    private readonly listPlans: ListInstallmentPlansUseCase,
    private readonly createPlan: CreateInstallmentPlanUseCase,
    private readonly deletePlan: DeleteInstallmentPlanUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.listPlans.execute({ userId: req.userId });
      res.json({
        data: {
          plans: result.plans.map(InstallmentPlanPresenter.toHttp),
          remainingCents: result.remainingCents,
          monthlyCents: result.monthlyCents,
          openPlans: result.openPlans,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const { plan, linked } = await this.createPlan.execute({ userId: req.userId, ...body });
      res.status(201).json({
        data: { plan: InstallmentPlanPresenter.toHttp(plan), linked },
      });
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      await this.deletePlan.execute({ userId: req.userId, planId: id });
      res.json({ data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  };
}
