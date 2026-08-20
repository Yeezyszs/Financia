import type {
  ParsedStatementEntry,
  StatementParser,
  StatementTable,
} from '../../../../application/ports/StatementParser';
import { detectColumns, parseAmount, parseDate } from './columns';

const INSTALLMENT = /parcela\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})|(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;

/**
 * Parser que descobre as colunas em vez de assumir um layout fixo.
 *
 * E o padrao do sistema, nao um plano B. Extrato de banco e tabular e
 * autodescritivo - data, descricao e valor sao reconheciveis pelo conteudo.
 * Isso evita ter que escrever (e manter) um parser por banco so para mapear
 * tres colunas, e faz um banco novo funcionar sem codigo nenhum.
 *
 * Um parser dedicado so se justifica quando o formato tem particularidade que
 * a deteccao nao pega - colunas separadas de parcela, moeda estrangeira em
 * coluna propria, valor dividido em debito/credito.
 */
export class GenericStatementParser implements StatementParser {
  readonly institution = 'generico';

  confidence(table: StatementTable): number {
    const { date, amount, merchant } = detectColumns(table);
    if (date < 0 || amount < 0 || merchant < 0) return 0;
    // Deliberadamente baixa: qualquer parser dedicado deve ganhar deste.
    return 0.3;
  }

  parse(table: StatementTable): ParsedStatementEntry[] {
    const columns = detectColumns(table);
    if (columns.date < 0 || columns.amount < 0 || columns.merchant < 0) {
      throw new Error(
        `Nao consegui identificar as colunas de data, valor e descricao. ` +
          `Cabecalho lido: ${table.headers.join(' | ') || '(vazio)'}`,
      );
    }

    const entries: ParsedStatementEntry[] = [];

    table.rows.forEach((row, index) => {
      const occurredAt = parseDate(row[columns.date] ?? '');
      const amount = parseAmount(row[columns.amount] ?? '');
      const merchant = (row[columns.merchant] ?? '').trim();

      // Linha que nao converte e rodape ("Total da fatura", "Saldo anterior")
      // ou linha em branco. Ignorar em silencio e correto aqui.
      if (!occurredAt || !amount || merchant === '') return;

      entries.push({
        amount,
        merchant,
        occurredAt,
        // Em fatura de cartao, negativo e pagamento ou estorno.
        kind: amount.isNegative ? 'refund' : 'purchase',
        ...(readInstallment(merchant) ? { installment: readInstallment(merchant)! } : {}),
        lineNumber: index,
      });
    });

    return entries;
  }
}

function readInstallment(merchant: string): { current: number; total: number } | undefined {
  const match = INSTALLMENT.exec(merchant);
  if (!match) return undefined;

  const current = match[1] ?? match[3];
  const total = match[2] ?? match[4];
  if (!current || !total) return undefined;

  const parsed = { current: Number(current), total: Number(total) };
  // "1/2" pode ser data mal formatada; parcela total acima de 24 e implausivel.
  return parsed.total > 1 && parsed.total <= 24 && parsed.current <= parsed.total ? parsed : undefined;
}
