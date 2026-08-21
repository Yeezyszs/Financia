import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      /** `sub` do JWT do Supabase — o dono das linhas desta request. */
      userId: string;
      /** JWT repassado ao PostgREST para o RLS valer. */
      accessToken: string;
    }
  }
}

/**
 * Lê o Bearer token e extrai o `sub` sem verificar a assinatura.
 *
 * Isso é seguro — e proposital — porque nada é autorizado com base nesse
 * valor: toda leitura e escrita vai para o Postgres com o mesmo token, e
 * lá o PostgREST **verifica a assinatura** antes de o RLS comparar
 * `auth.uid()` com `user_id`. Um token forjado passaria por aqui e
 * morreria no banco, sem ler nem gravar nada.
 *
 * A alternativa seria chamar `auth.getUser()` a cada request, o que
 * custa uma ida à rede por chamada para reconfirmar o que o banco já
 * confirma de graça.
 */
export function requireAuth(): RequestHandler {
  return (req, res, next) => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Faça login para continuar' },
      });
      return;
    }

    const userId = subjectOf(token);
    if (!userId) {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Sessão inválida. Faça login de novo.' },
      });
      return;
    }

    req.userId = userId;
    req.accessToken = token;
    next();
  };
}

/** Lê o campo `sub` do payload do JWT. Sem verificação — ver acima. */
function subjectOf(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof decoded.sub === 'string' && decoded.sub.length > 0 ? decoded.sub : null;
  } catch {
    return null;
  }
}
