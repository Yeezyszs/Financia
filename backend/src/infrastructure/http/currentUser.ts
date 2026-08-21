import type { RequestHandler } from 'express';

/**
 * A augmentação mora aqui, junto do middleware que preenche o campo — e
 * não num .d.ts solto. Arquivo ambiente só entra no programa se estiver
 * no `include` do tsconfig, o que quebra quando outro tsconfig (o da
 * raiz, usado pela function da Vercel) compila a app por outro caminho.
 * Como augmentação dentro de módulo importado, ela sempre acompanha.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Single-user por enquanto: preenchido por currentUser(). */
      userId: string;
    }
  }
}

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
