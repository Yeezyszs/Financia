import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main/app.js';
import type { Env } from '../../src/infrastructure/config/env.js';

const env: Env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-de-teste',
  API_TOKEN: 'a'.repeat(48),
  DEFAULT_USER_ID: '00000000-0000-0000-0000-000000000001',
  PORT: 3333,
  NODE_ENV: 'test',
};

const app = createApp(env);

describe('borda HTTP', () => {
  it('health responde sem token (é o que o monitoramento consulta)', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('rejeita request sem token', async () => {
    const response = await request(app).get('/api/accounts');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejeita token errado do mesmo tamanho', async () => {
    const response = await request(app).get('/api/accounts').set('x-api-key', 'b'.repeat(48));
    expect(response.status).toBe(401);
  });

  it('valida o corpo da importação antes de tocar no banco', async () => {
    const response = await request(app)
      .post('/api/imports')
      .set('x-api-key', env.API_TOKEN)
      .send({ accountId: 'nao-e-uuid', filename: '', content: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
