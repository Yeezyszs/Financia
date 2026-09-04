import type { AccountType, Institution } from '../../domain/entities/Account.js';
import type {
  StatementParser,
  StatementParserRegistry,
} from '../../application/ports/parsers/StatementParser.js';
import { StatementCsvParser } from './csv/StatementCsvParser.js';
import { LAYOUTS } from './layouts/index.js';

/**
 * Registro dos adapters de ingestão. Um banco novo é uma entrada em
 * `layouts`, não um arquivo de código novo.
 */
export class ParserRegistry implements StatementParserRegistry {
  private readonly parsers: StatementParser[] = LAYOUTS.map(
    (layout) => new StatementCsvParser(layout),
  );

  resolve(institution: Institution, accountType: AccountType): StatementParser | null {
    return (
      this.parsers.find((p) => p.institution === institution && p.accountType === accountType) ??
      null
    );
  }

  /**
   * Detecção pelo conteúdo é fallback: extrato e fatura costumam ter o
   * mesmo cabeçalho, e o que os separa é a convenção de sinal. Quem
   * decide de verdade é o tipo da conta escolhida no upload.
   */
  detect(content: string): StatementParser | null {
    return this.parsers.find((parser) => parser.supports(content)) ?? null;
  }
}
