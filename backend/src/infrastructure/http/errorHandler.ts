import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError, NotFoundError } from '../../domain/errors/DomainError.js';

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

  console.error('[unhandled]', error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno' } });
};
