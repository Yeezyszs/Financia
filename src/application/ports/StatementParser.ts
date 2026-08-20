import type { Money } from '../../domain/entities/Money';
import type { TransactionKind } from '../../domain/entities/Transaction';

/** Uma linha do arquivo, ja separada em colunas. */
export type StatementRow = string[];

export interface StatementTable {
  headers: string[];
  rows: StatementRow[];
}

/** O que o parser extrai de uma linha. Sem ids: quem persiste e o use case. */
export interface ParsedStatementEntry {
  amount: Money;
  merchant: string;
  occurredAt: Date;
  kind: TransactionKind;
  installment?: { current: number; total: number };
  /** Posicao no arquivo. Entra na identidade da transacao (ver ImportStatementFile). */
  lineNumber: number;
}

/**
 * Um parser por formato de extrato. Mesma ideia do EmailParser: o use case de
 * importacao nao sabe de qual banco veio o arquivo.
 *
 * Diferenca importante em relacao ao e-mail: aqui o `canParse` olha o
 * CABECALHO, nao o conteudo. Formato de CSV se identifica pelas colunas.
 */
export interface StatementParser {
  readonly institution: string;
  /** Confianca de 0 a 1 de que este parser entende o arquivo. */
  confidence(table: StatementTable): number;
  parse(table: StatementTable): ParsedStatementEntry[];
}

export interface StatementParserRegistry {
  /** Escolhe o parser de maior confianca. Nunca devolve null: ha um generico. */
  resolve(table: StatementTable): StatementParser;
}
