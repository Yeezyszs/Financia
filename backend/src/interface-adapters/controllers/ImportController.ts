import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ImportStatementUseCase } from '../../application/use-cases/imports/ImportStatementUseCase.js';
import type { ListImportsUseCase } from '../../application/use-cases/imports/ListImportsUseCase.js';
import type { FlipImportSignsUseCase } from '../../application/use-cases/imports/FlipImportSignsUseCase.js';
import type { DeleteImportUseCase } from '../../application/use-cases/imports/DeleteImportUseCase.js';
import { ImportPresenter } from '../presenters/ImportPresenter.js';

/** Limite defensivo: extrato de um mês não passa de alguns milhares de linhas. */
const MAX_CONTENT_CHARS = 2_000_000;

const createSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
  force: z.boolean().optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export class ImportController {
  constructor(
    private readonly importStatement: ImportStatementUseCase,
    private readonly listImports: ListImportsUseCase,
    private readonly flipSigns: FlipImportSignsUseCase,
    private readonly deleteImport: DeleteImportUseCase,
  ) {}

  /** Desfaz a importação: apaga as transações dela e o registro. */
  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const result = await this.deleteImport.execute({ userId: req.userId, importId: id });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  /** Corrige uma importação inteira que entrou com o sinal trocado. */
  flip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const result = await this.flipSigns.execute({ userId: req.userId, importId: id });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.parse(req.body);
      const result = await this.importStatement.execute({ userId: req.userId, ...body });
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listSchema.parse(req.query);
      const records = await this.listImports.execute({ userId: req.userId, ...query });
      res.json({ data: records.map(ImportPresenter.toHttp) });
    } catch (error) {
      next(error);
    }
  };
}
