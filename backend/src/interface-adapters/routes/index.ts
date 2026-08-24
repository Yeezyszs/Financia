import { Router, type RequestHandler } from 'express';
import type { AccountController } from '../controllers/AccountController.js';
import type { TransactionController } from '../controllers/TransactionController.js';
import type { ImportController } from '../controllers/ImportController.js';
import type { ReportController } from '../controllers/ReportController.js';

export interface Controllers {
  accounts: AccountController;
  transactions: TransactionController;
  imports: ImportController;
  reports: ReportController;
}

/**
 * Cada request tem o seu próprio conjunto de controllers, porque o
 * cliente do Supabase carrega o JWT de quem fez a chamada. As rotas não
 * precisam saber disso: pedem o handler ao resolver e pronto.
 */
export type ControllerResolver = (
  pick: (controllers: Controllers) => RequestHandler,
) => RequestHandler;

export function buildRoutes(route: ControllerResolver): Router {
  const router = Router();

  router.get(
    '/accounts',
    route((c) => c.accounts.list),
  );
  router.post(
    '/accounts',
    route((c) => c.accounts.create),
  );

  router.get(
    '/transactions',
    route((c) => c.transactions.list),
  );

  router.patch(
    '/transactions/:id/category',
    route((c) => c.transactions.categorize),
  );

  router.get(
    '/imports',
    route((c) => c.imports.list),
  );
  router.post(
    '/imports',
    route((c) => c.imports.create),
  );

  router.get(
    '/categories',
    route((c) => c.reports.categories),
  );
  router.get(
    '/reports/overview',
    route((c) => c.reports.overview),
  );
  router.get(
    '/reports/snapshot',
    route((c) => c.reports.snapshot),
  );
  // Sem extensão no caminho de propósito: a Vercel serve arquivo estático
  // antes de aplicar rewrite, e um caminho terminado em .md entra nessa
  // disputa sem precisar.
  router.get(
    '/reports/summary',
    route((c) => c.reports.summaryMarkdown),
  );

  return router;
}
