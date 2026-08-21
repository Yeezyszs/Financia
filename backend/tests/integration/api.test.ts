import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main/app.js';
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
    const response = await request(app).get('/api/accounts').set('Authorization', 'Bearer nao-e-jwt');
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

  it('valida o corpo da importação antes de tocar no banco', async () => {
    const response = await request(app)
      .post('/api/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId: 'nao-e-uuid', filename: '', content: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
