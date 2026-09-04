import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main/app.js';
import { buildRoutes } from '../../src/interface-adapters/routes/index.js';
import type { Env } from '../../src/infrastructure/config/env.js';

const env: Env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
  PORT: 3333,
  NODE_ENV: 'test',
};

const app = createApp(env);

/** JWT de mentira: só o payload importa, a assinatura quem valida é o Postgres. */
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.assinatura-falsa`;
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const token = fakeJwt({ sub: USER_ID, role: 'authenticated' });

describe('borda HTTP', () => {
  it('health responde sem login (é o que o monitoramento consulta)', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('rejeita request sem Authorization', async () => {
    const response = await request(app).get('/api/accounts');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejeita header que não é Bearer', async () => {
    const response = await request(app).get('/api/accounts').set('Authorization', `Basic ${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejeita token que não é um JWT decodificável', async () => {
    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', 'Bearer nao-e-jwt');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejeita JWT sem sub', async () => {
    const response = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${fakeJwt({ role: 'authenticated' })}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
  });

  /**
   * A lição que gerou este teste: duas rotas ficaram sem registrar e
   * ninguém notou, porque o teste de ponta a ponta usava um servidor de
   * mentira que respondia por elas.
   *
   * A verificação é sobre a tabela de rotas, não sobre requisições: bater
   * de verdade em cada rota exigiria um banco, e o que falhou aqui não
   * teve nada a ver com banco.
   */
  it('registra todas as rotas que o frontend consome', () => {
    const registradas = new Set<string>();
    const router = buildRoutes(() => (_req, _res, next) => next());

    for (const layer of (router as unknown as { stack: RouterLayer[] }).stack) {
      if (!layer.route) continue;
      for (const metodo of Object.keys(layer.route.methods)) {
        registradas.add(`${metodo.toUpperCase()} ${layer.route.path}`);
      }
    }

    expect([...registradas].sort()).toEqual([
      'DELETE /imports/:id',
      'GET /accounts',
      'GET /categories',
      'GET /imports',
      'GET /reports/overview',
      'GET /reports/snapshot',
      'GET /reports/summary',
      'GET /transactions',
      'PATCH /transactions/:id',
      'PATCH /transactions/:id/category',
      'POST /accounts',
      'POST /imports',
      'POST /imports/:id/flip-signs',
    ]);
  });

  it('rota inexistente devolve 404', async () => {
    const response = await request(app)
      .get('/api/nao-existe')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it('valida o corpo da importação antes de tocar no banco', async () => {
    const response = await request(app)
      .post('/api/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId: 'nao-e-uuid', filename: '', content: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
