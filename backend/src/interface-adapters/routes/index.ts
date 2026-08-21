import { Router } from 'express';
import type { AccountController } from '../controllers/AccountController.js';
import type { TransactionController } from '../controllers/TransactionController.js';
import type { ImportController } from '../controllers/ImportController.js';

export function buildRoutes(controllers: {
  accounts: AccountController;
  transactions: TransactionController;
  imports: ImportController;
}): Router {
  const router = Router();

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));

  router.get('/accounts', controllers.accounts.list);
  router.post('/accounts', controllers.accounts.create);

  router.get('/transactions', controllers.transactions.list);

  router.get('/imports', controllers.imports.list);
  router.post('/imports', controllers.imports.create);

  return router;
}
