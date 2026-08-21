import express, { type Express, type RequestHandler } from 'express';
import type { Env } from '../infrastructure/config/env.js';
import { buildControllers } from './container.js';
import { buildRoutes, type Controllers } from '../interface-adapters/routes/index.js';
import { requireAuth } from '../infrastructure/http/requireAuth.js';
import { errorHandler } from '../infrastructure/http/errorHandler.js';

export function createApp(env: Env): Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));

  // O health fica antes da autenticação: é o que o monitoramento consulta.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', requireAuth());

  const route =
    (pick: (controllers: Controllers) => RequestHandler): RequestHandler =>
    (req, res, next) =>
      pick(buildControllers(env, req.accessToken))(req, res, next);

  app.use('/api', buildRoutes(route));
  app.use(errorHandler);

  return app;
}
