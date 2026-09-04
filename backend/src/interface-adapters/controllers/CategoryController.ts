import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ListCategoriesUseCase } from '../../application/use-cases/categories/ListCategoriesUseCase.js';
import type { CreateCategoryUseCase } from '../../application/use-cases/categories/CreateCategoryUseCase.js';
import { CategoryPresenter } from '../presenters/CategoryPresenter.js';

const createSchema = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(['income', 'expense', 'transfer']).optional(),
});

export class CategoryController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly createCategory: CreateCategoryUseCase,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await this.listCategories.execute({ userId: req.userId });
      res.json({ data: categories.map(CategoryPresenter.toHttp) });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const result = await this.createCategory.execute({ userId: req.userId, ...body });

      // 200 quando a categoria já existia: nada foi criado, e o 201 diria
      // ao cliente que existe um recurso novo onde não existe.
      res.status(result.created ? 201 : 200).json({
        data: { category: CategoryPresenter.toHttp(result.category), created: result.created },
      });
    } catch (error) {
      next(error);
    }
  };
}
