import type { Money } from '../../domain/entities/Money';
import type { TransactionKind } from '../../domain/entities/Transaction';

/** E-mail cru, no formato que o gateway entrega. Sem nada especifico do Gmail. */
export interface RawEmail {
  /** Identificador estavel na caixa de origem. Chave de idempotencia. */
  id: string;
  from: string;
  subject: string;
  receivedAt: Date;
  /** Corpo em texto puro, ja convertido pelo gateway se o original era HTML. */
  body: string;
}

/** O que um parser consegue extrair. Sem ids do banco: quem persiste e o use case. */
export interface ParsedTransaction {
  amount: Money;
  merchant: string;
  occurredAt: Date;
  kind: TransactionKind;
  last4?: string;
  installment?: { current: number; total: number };
}

/**
 * Um parser por instituicao. O use case de ingestao nunca sabe qual banco
 * mandou o e-mail: ele pede o parser pelo EmailSource.parserStrategy e pronto.
 * Banco novo = arquivo novo aqui + uma linha no registry. Zero mudanca no dominio.
 */
export interface EmailParser {
  /** Casa com EmailSource.parserStrategy. Ex: 'nubank', 'inter'. */
  readonly institution: string;

  /**
   * Este parser reconhece este e-mail? Um mesmo remetente manda compra,
   * fatura fechada, promocao... So o e-mail de transacao interessa.
   */
  canParse(email: RawEmail): boolean;

  /** Retorna null quando o e-mail nao carrega uma transacao (ex: aviso de fatura). */
  parse(email: RawEmail): ParsedTransaction | null;
}

export interface EmailParserRegistry {
  /** Lanca se a estrategia nao existir: fonte cadastrada sem parser e bug de config. */
  resolve(parserStrategy: string): EmailParser;
  has(parserStrategy: string): boolean;
}
