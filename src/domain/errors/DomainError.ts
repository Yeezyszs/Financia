/**
 * Erro de regra de negocio. Distinto de erro tecnico (rede, banco, parsing)
 * para que as camadas de fora saibam se devem responder 4xx ou 5xx.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
