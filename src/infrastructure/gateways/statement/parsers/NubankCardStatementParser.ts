import type {
  ParsedStatementEntry,
  StatementParser,
  StatementTable,
} from '../../../../application/ports/StatementParser';
import { GenericStatementParser } from './GenericStatementParser';

/**
 * Fatura de cartao do Nubank. O CSV exportado pelo app tem cabecalho fixo
 * `date,title,amount`, com data ISO e valor com ponto decimal.
 *
 * Existe para reconhecer o formato com certeza (confianca alta) em vez de
 * depender da heuristica. A extracao em si reaproveita a generica: o layout
 * nao tem nenhuma particularidade que justifique codigo proprio.
 */
export class NubankCardStatementParser implements StatementParser {
  readonly institution = 'nubank';
  private readonly generic = new GenericStatementParser();

  confidence(table: StatementTable): number {
    const headers = table.headers.map((h) => h.toLowerCase().trim());
    const expected = ['date', 'title', 'amount'];
    const matches = expected.filter((column) => headers.includes(column)).length;
    return matches === expected.length ? 0.95 : matches / expected.length / 2;
  }

  parse(table: StatementTable): ParsedStatementEntry[] {
    return this.generic.parse(table);
  }
}
