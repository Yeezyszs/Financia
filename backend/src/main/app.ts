import express, { type Express } from 'express';
import type { Env } from '../infrastructure/config/env.js';
import { buildContainer } from './container.js';
import { buildRoutes } from '../interface-adapters/routes/index.js';
import { currentUser } from '../infrastructure/http/currentUser.js';
import { errorHandler } from '../infrastructure/http/errorHandler.js';

export function createApp(env: Env): Express {
  const container = buildContainer(env);

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(currentUser(env.DEFAULT_USER_ID));
  app.use('/api', buildRoutes(container.controllers));
  app.use(errorHandler);

  return app;
}
