import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Trava de acesso da API.
 *
 * O backend fala com o Supabase usando a service_role, que ignora RLS —
 * então uma URL pública sem autenticação seria acesso total às finanças
 * para quem descobrisse o endereço. Enquanto o login de verdade
 * (Supabase Auth) não entra, um token compartilhado no header resolve:
 * o frontend guarda o token, e sem ele a API não responde nada.
 *
 * Comparação em tempo constante para o token não vazar por timing.
 */
export function requireApiToken(expected: string): RequestHandler {
  const expectedBuffer = Buffer.from(expected);

  return (req, res, next) => {
    // health check fica aberto: é o que o monitoramento consulta
    if (req.path === '/api/health') return next();

    const header = req.header('x-api-key') ?? '';
    const provided = Buffer.from(header);

    const authorized =
      provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);

    if (!authorized) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token inválido' } });
      return;
    }

    next();
  };
}
