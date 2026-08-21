/** Erro de regra de negócio — vira 4xx na borda HTTP, nunca 500. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string = 'DOMAIN_ERROR',
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} não encontrado: ${id}` : `${resource} não encontrado`, 'NOT_FOUND');
  }
}
