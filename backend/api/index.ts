/**
 * Entrypoint serverless da Vercel.
 *
 * A mesma app Express que roda em `npm run dev` vira a function servida
 * em /api/*. O `vercel.json` reescreve todas as rotas /api/... para cá,
 * e o Express faz o roteamento interno — nenhuma rota precisa ser
 * duplicada em configuração.
 */
import { loadEnv } from '../src/infrastructure/config/env.js';
import { createApp } from '../src/main/app.js';

export default createApp(loadEnv());
