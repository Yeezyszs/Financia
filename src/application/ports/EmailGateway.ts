import type { RawEmail } from './EmailParser.js';

export interface EmailSearchQuery {
  /** Sintaxe da caixa de origem (no Gmail, a mesma da barra de busca). */
  query: string;
  after?: Date;
  maxResults?: number;
}

/**
 * Abstrai a caixa de e-mail. O use case fala com esta interface, entao trocar
 * Gmail por IMAP depois nao encosta em nada de dentro.
 */
export interface EmailGateway {
  search(query: EmailSearchQuery): Promise<RawEmail[]>;
  getById(id: string): Promise<RawEmail | null>;
}
