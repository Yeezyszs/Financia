import type { Institution, AccountType } from '../../../domain/entities/Account.js';

/** Uma linha crua já normalizada pelo adapter do banco. */
export interface ParsedTransactionRow {
  /** YYYY-MM-DD */
  occurredOn: string;
  description: string;
  amountCents: number;
  /** Qualquer coisa específica do banco que valha guardar (ex: categoria do Nubank). */
  raw?: Record<string, string>;
}

export interface ParsedStatement {
  rows: ParsedTransactionRow[];
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Porta de ingestão. Cada banco/fonte implementa isso na camada de
 * infraestrutura — Nubank conta corrente, Nubank fatura, C6 (adiado).
 * O use case de importação não sabe nada sobre CSV.
 */
export interface StatementParser {
  readonly institution: Institution;
  readonly accountType: AccountType;
  /** Aceita esse conteúdo? Usado para detectar o layout automaticamente. */
  supports(content: string): boolean;
  parse(content: string): ParsedStatement;
}

export interface StatementParserRegistry {
  /** Parser explícito por instituição + tipo de conta. */
  resolve(institution: Institution, accountType: AccountType): StatementParser | null;
  /** Detecção pelo conteúdo, quando o usuário não escolhe a fonte. */
  detect(content: string): StatementParser | null;
}
