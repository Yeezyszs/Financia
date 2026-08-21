import type { RequestHandler } from 'express';

/**
 * Enquanto o sistema é single-user, o user_id vem do .env. Quando entrar
 * login de verdade, só este middleware muda: valida o JWT do Supabase e
 * põe o sub em req.userId. Nada acima disso precisa saber.
 */
export function currentUser(defaultUserId: string): RequestHandler {
  return (req, _res, next) => {
    req.userId = defaultUserId;
    next();
  };
}
