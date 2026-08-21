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
const DESCRIPTION_COLUMNS = ['title', 'descricao', 'description', 'titulo', 'estabelecimento'];
const AMOUNT_COLUMNS = ['amount', 'valor'];

/**
 * Fatura do cartão de crédito do Nubank.
 *
 * ATENÇÃO À CONVENÇÃO DE SINAL. Na fatura, o valor é o quanto foi
 * *cobrado*: compra aparece positiva e pagamento/estorno aparece
 * negativo — o inverso do extrato da conta corrente. O domínio inteiro
 * assume "negativo = saída", então este parser inverte o sinal na
 * entrada. É a única diferença real entre ele e o parser do extrato.
 *
 * Isso está baseado no layout conhecido do export; confirmar com uma
 * fatura real antes de fechar o primeiro mês. Se o seu export já vier
 * com compra negativa, basta INVERT_SIGN = false.
 */
const INVERT_SIGN = true;

export class NubankCreditCardParser implements StatementParser {
  readonly institution: Institution = 'nubank';
  readonly accountType: AccountType = 'credit_card';

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

    if (dateAt === -1 || descriptionAt === -1 || amountAt === -1) {
      throw new DomainError(
        `CSV não parece uma fatura do Nubank. Colunas encontradas: ${header.join(', ')}`,
        'UNSUPPORTED_STATEMENT',
      );
    }

    const parsed: ParsedTransactionRow[] = [];

    rows.forEach((row, index) => {
      const rawDate = row[dateAt]?.trim() ?? '';
      const rawDescription = row[descriptionAt]?.trim() ?? '';
      const rawAmount = row[amountAt]?.trim() ?? '';

      if (!rawDate && !rawDescription && !rawAmount) return;

      const lineNumber = index + 2;
      if (!rawDate || !rawAmount) {
        throw new DomainError(`Linha ${lineNumber}: data ou valor ausente`, 'INVALID_ROW');
      }

      const amount = Money.fromDecimalString(rawAmount);
      if (amount.cents === 0) return;

      parsed.push({
        occurredOn: parseStatementDate(rawDate),
        description: rawDescription || 'Sem descrição',
        amountCents: INVERT_SIGN ? -amount.cents : amount.cents,
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
