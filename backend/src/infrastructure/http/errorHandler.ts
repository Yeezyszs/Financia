import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError, NotFoundError } from '../../domain/errors/DomainError.js';

/** Erros de JWT do PostgREST: código PGRST301 ou mensagem falando de JWT. */
function isExpiredSession(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = 'message' in error ? String((error as { message: unknown }).message) : '';

  return code === 'PGRST301' || /jwt (expired|invalid)/i.test(message);
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Requisição inválida', issues: error.issues },
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof DomainError) {
    res.status(400).json({ error: { code: error.code, message: error.message } });
    return;
  }

  // Sessão expirada chega aqui como erro do PostgREST. Sem esse tratamento
  // viraria 500, e o frontend não teria como saber que basta relogar.
  if (isExpiredSession(error)) {
    res.status(401).json({
      error: { code: 'SESSION_EXPIRED', message: 'Sessão expirada. Faça login de novo.' },
    });
    return;
  }

  console.error('[unhandled]', error);

  // A mensagem real vai na resposta de propósito: toda rota que chega
  // aqui exige sessão autenticada, então quem lê é o dono dos dados — e
  // "Erro interno" sozinho obriga a caçar log de servidor para descobrir
  // qualquer coisa. Stack não vai: só a mensagem e o código.
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error);

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno',
      detail,
      ...(code ? { sourceCode: code } : {}),
    },
  });
};
