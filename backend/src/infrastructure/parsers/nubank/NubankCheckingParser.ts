import type { AccountType, Institution } from '../../../domain/entities/Account.js';
import { DomainError } from '../../../domain/errors/DomainError.js';
import { Money } from '../../../domain/value-objects/Money.js';
import type {
  ParsedStatement,
  ParsedTransactionRow,
  StatementParser,
} from '../../../application/ports/parsers/StatementParser.js';
import { columnIndex, detectDelimiter, parseCsv } from '../csv/CsvReader.js';
import { parseStatementDate } from '../csv/parseDate.js';

const DATE_COLUMNS = ['date', 'data'];
const DESCRIPTION_COLUMNS = ['title', 'descricao', 'description', 'historico', 'titulo'];
const AMOUNT_COLUMNS = ['amount', 'valor'];
const IDENTIFIER_COLUMNS = ['identificador', 'identifier', 'id'];

/**
 * Extrato da conta corrente do Nubank.
 *
 * O export vem em duas variações conhecidas: `date,title,amount` e
 * `Data,Valor,Identificador,Descrição`. As duas caem aqui — o parser
 * procura as colunas por nome em vez de por posição, então mudança de
 * ordem de coluna não quebra a importação.
 *
 * O `identificador`, quando existe, é preservado em `raw` para
 * auditoria, mas NÃO é usado como chave de dedupe: nem todo export tem,
 * e a chave precisa ser a mesma nos dois formatos.
 */
export class NubankCheckingParser implements StatementParser {
  readonly institution: Institution = 'nubank';
  readonly accountType: AccountType = 'checking';

  supports(content: string): boolean {
    const { header } = parseCsv(content, detectDelimiter(content));
    return (
      columnIndex(header, DATE_COLUMNS) !== -1 &&
      columnIndex(header, AMOUNT_COLUMNS) !== -1 &&
      columnIndex(header, DESCRIPTION_COLUMNS) !== -1
    );
  }

  parse(content: string): ParsedStatement {
    const { header, rows } = parseCsv(content, detectDelimiter(content));

    const dateAt = columnIndex(header, DATE_COLUMNS);
    const descriptionAt = columnIndex(header, DESCRIPTION_COLUMNS);
    const amountAt = columnIndex(header, AMOUNT_COLUMNS);
    const identifierAt = columnIndex(header, IDENTIFIER_COLUMNS);

    if (dateAt === -1 || descriptionAt === -1 || amountAt === -1) {
      throw new DomainError(
        `CSV não parece um extrato do Nubank. Colunas encontradas: ${header.join(', ')}`,
        'UNSUPPORTED_STATEMENT',
      );
    }

    const parsed: ParsedTransactionRow[] = [];

    rows.forEach((row, index) => {
      const rawDate = row[dateAt]?.trim() ?? '';
      const rawDescription = row[descriptionAt]?.trim() ?? '';
      const rawAmount = row[amountAt]?.trim() ?? '';

      // linha em branco no fim do arquivo: ignora em silêncio
      if (!rawDate && !rawDescription && !rawAmount) return;

      const lineNumber = index + 2; // +1 do cabeçalho, +1 para virar 1-based
      if (!rawDate || !rawAmount) {
        throw new DomainError(`Linha ${lineNumber}: data ou valor ausente`, 'INVALID_ROW');
      }

      const amount = Money.fromDecimalString(rawAmount);
      if (amount.cents === 0) return; // estorno de valor zero não vira transação

      const identifier = identifierAt === -1 ? undefined : row[identifierAt]?.trim();

      parsed.push({
        occurredOn: parseStatementDate(rawDate),
        description: rawDescription || 'Sem descrição',
        amountCents: amount.cents,
        ...(identifier ? { raw: { identifier } } : {}),
      });
    });

    const dates = parsed.map((row) => row.occurredOn).sort();

    return {
      rows: parsed,
      periodStart: dates[0] ?? null,
      periodEnd: dates[dates.length - 1] ?? null,
    };
  }
}
